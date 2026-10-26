# Blender headless: auto-rig a T-posed character GLB (Characters/*.glb) for the game and shrink it.
# "C:/Program Files/Blender Foundation/Blender 4.3/blender.exe" -b --factory-startup -P tools/autorig.py -- Characters/Nina.glb public/models/nina.glb 1024
import bpy, sys, math
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
src, dst = argv[0], argv[1]
tex = int(argv[2]) if len(argv) > 2 else 1024

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
mesh = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
bpy.context.view_layer.objects.active = mesh
mesh.select_set(True)
# bone-heat weighting fails on tiny meshes: work at 10x (the game normalises height anyway)
mesh.scale = (10, 10, 10)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# merge near-duplicate vertices so bone-heat weighting has a connected surface
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=0.0005)
bpy.ops.object.mode_set(mode='OBJECT')

vs = [mesh.matrix_world @ v.co for v in mesh.data.vertices]
zmin = min(v.z for v in vs); zmax = max(v.z for v in vs)
H = zmax - zmin
xs = [v.x for v in vs]
cx = (max(xs) + min(xs)) / 2
cy = sum(v.y for v in vs) / len(vs)

def band(z0, z1):
    return [v for v in vs if z0 <= v.z < z1]

# shoulder height: the slice with the widest span (T-pose arms)
best, shoulder = 0, zmin + H * 0.7
for i in range(40, 95):
    z = zmin + H * i / 100
    b = band(z - H * 0.01, z + H * 0.01)
    if not b: continue
    w = max(v.x for v in b) - min(v.x for v in b)
    if w > best: best, shoulder = w, z
span = best
hand = span / 2

# crotch: lowest height where a centre column of vertices appears (legs merge into the body)
crotch = zmin + H * 0.4
for i in range(5, 70):
    z = zmin + H * i / 100
    b = band(z - H * 0.008, z + H * 0.008)
    if any(abs(v.x - cx) < H * 0.012 for v in b):
        crotch = z
        break

# leg x: the centre of vertices just below the crotch on each side
legb = band(crotch - H * 0.12, crotch - H * 0.04)
lx = [v.x - cx for v in legb if v.x - cx > 0]
legx = (sum(lx) / len(lx)) if lx else H * 0.08
neck = shoulder + (zmax - shoulder) * 0.18
# depth centre of the torso itself (long hair behind would drag a plain average out of the body)
torso = [v for v in band(crotch, shoulder) if abs(v.x - cx) < H * 0.08]
if torso: cy = (min(v.y for v in torso) + max(v.y for v in torso)) / 2
chest = (crotch + shoulder) / 2
print(f'[autorig] H={H:.3f} shoulder={(shoulder - zmin) / H:.2f} crotch={(crotch - zmin) / H:.2f} span={span / H:.2f} legx={legx / H:.2f}')

bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
arm = bpy.context.object
arm.name = 'Rig'
eb = arm.data.edit_bones
eb.remove(eb[0])

def bone(name, head, tail, parent=None):
    b = eb.new(name)
    b.head = Vector(head); b.tail = Vector(tail)
    if parent: b.parent = eb[parent]; b.use_connect = False
    return b

y = cy
hips = bone('hips', (cx, y, crotch + H * 0.02), (cx, y, chest))
bone('spine', (cx, y, chest), (cx, y, neck), 'hips')
bone('head', (cx, y, neck), (cx, y, zmax), 'spine')
sw = span * 0.12  # shoulder joint offset from centre
for side, sx in (('L', 1), ('R', -1)):
    elbow = cx + sx * (sw + (hand - sw) * 0.5)
    bone(f'upperarm.{side}', (cx + sx * sw, y, shoulder), (elbow, y, shoulder), 'spine')
    bone(f'forearm.{side}', (elbow, y, shoulder), (cx + sx * hand, y, shoulder), f'upperarm.{side}')
    knee = zmin + (crotch - zmin) * 0.5
    bone(f'thigh.{side}', (cx + sx * legx, y, crotch), (cx + sx * legx, y, knee), 'hips')
    bone(f'shin.{side}', (cx + sx * legx, y, knee), (cx + sx * legx, y, zmin + H * 0.02), f'thigh.{side}')
bpy.ops.object.mode_set(mode='OBJECT')

# bind: automatic (bone heat) weights; fall back to envelopes if heat fails
bpy.ops.object.select_all(action='DESELECT')
mesh.select_set(True); arm.select_set(True)
bpy.context.view_layer.objects.active = arm
mode = 'auto'
try:
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
except Exception as e:
    print('[autorig] heat failed:', e)
weighted = sum(1 for v in mesh.data.vertices if any(g.weight > 0.01 for g in v.groups))
if weighted < len(mesh.data.vertices) * 0.9:
    # bone heat needs a watertight surface: weight a voxel-remeshed copy, then copy the weights
    # onto the real mesh (nearest surface, interpolated)
    mode = 'voxel proxy'
    for g in list(mesh.vertex_groups): mesh.vertex_groups.remove(g)
    for m in list(mesh.modifiers):
        if m.type == 'ARMATURE': mesh.modifiers.remove(m)
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.duplicate()
    proxy = bpy.context.view_layer.objects.active
    proxy.parent = None
    rm = proxy.modifiers.new('remesh', 'REMESH')
    rm.mode = 'VOXEL'
    rm.voxel_size = H / 160
    bpy.ops.object.modifier_apply(modifier=rm.name)
    bpy.ops.object.select_all(action='DESELECT')
    proxy.select_set(True); arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    pw = sum(1 for v in proxy.data.vertices if any(g.weight > 0.01 for g in v.groups))
    print(f'[autorig] proxy weighted {pw}/{len(proxy.data.vertices)}')
    for b in arm.data.bones:
        if b.name not in mesh.vertex_groups: mesh.vertex_groups.new(name=b.name)
    dt = mesh.modifiers.new('weights', 'DATA_TRANSFER')
    dt.object = proxy
    dt.use_vert_data = True
    dt.data_types_verts = {'VGROUP_WEIGHTS'}
    dt.vert_mapping = 'POLYINTERP_NEAREST'
    dt.layers_vgroup_select_src = 'ALL'
    dt.layers_vgroup_select_dst = 'NAME'
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.modifier_apply(modifier=dt.name)
    bpy.data.objects.remove(proxy, do_unlink=True)
    mesh.parent = arm
    mesh.matrix_parent_inverse = arm.matrix_world.inverted()
    am = mesh.modifiers.new('Armature', 'ARMATURE')
    am.object = arm
    weighted = sum(1 for v in mesh.data.vertices if any(g.weight > 0.01 for g in v.groups))
print(f'[autorig] weights: {mode}, {weighted}/{len(mesh.data.vertices)} vertices weighted')

# long hair touching the shoulders in the T-pose must not follow the arms: anything inside the
# shoulder joints moves with the head (above the neck) or the spine instead
arm_groups = [g for g in mesh.vertex_groups if g.name.startswith(('upperarm', 'forearm'))]
arm_idx = {g.index for g in arm_groups}
head_g, spine_g = mesh.vertex_groups.get('head'), mesh.vertex_groups.get('spine')
moved = 0
for v in mesh.data.vertices:
    p = mesh.matrix_world @ v.co
    if abs(p.x - cx) > sw * 0.95 or p.z < shoulder - H * 0.06: continue
    w = sum(g.weight for g in v.groups if g.group in arm_idx)
    if w <= 0.001: continue
    for g in arm_groups: g.remove([v.index])
    (head_g if p.z > neck - H * 0.02 else spine_g).add([v.index], w, 'ADD')
    moved += 1
print(f'[autorig] moved {moved} hair/shoulder vertices off the arms')

# any vertex left without weights (loose hair strands, buttons) goes fully to the nearest bone,
# otherwise it would collapse to the origin in the game
def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(1e-9, ab.length_squared)))
    return (a + ab * t - p).length
bones = [(b.name, arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local) for b in arm.data.bones]
groups = {g.name: g for g in mesh.vertex_groups}
for b in bones:
    if b[0] not in groups: groups[b[0]] = mesh.vertex_groups.new(name=b[0])
fixed = 0
for v in mesh.data.vertices:
    if any(g.weight > 0.01 for g in v.groups): continue
    p = mesh.matrix_world @ v.co
    name = min(bones, key=lambda b: seg_dist(p, b[1], b[2]))[0]
    groups[name].add([v.index], 1.0, 'REPLACE')
    fixed += 1
print(f'[autorig] gave {fixed} unbound vertices to their nearest bone')

# textures: keep only the base colour (the game draws toon shading), scaled down
mat = mesh.data.materials[0]
nt = mat.node_tree
bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
for inp in ('Metallic', 'Roughness', 'Normal'):
    for l in list(bsdf.inputs[inp].links): nt.links.remove(l)
bsdf.inputs['Metallic'].default_value = 0.0
bsdf.inputs['Roughness'].default_value = 0.8
for n in list(nt.nodes):
    if n.type in ('TEX_IMAGE', 'NORMAL_MAP', 'SEPARATE_COLOR', 'SEPARATE_RGB') and not any(l.to_node == bsdf and l.to_socket.name == 'Base Color' for o in n.outputs for l in o.links):
        nt.nodes.remove(n)
for img in bpy.data.images:
    if img.users and img.size[0] > tex:
        img.scale(tex, tex)

bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=82,
                          export_animations=False, export_skins=True, export_normals=True, export_tangents=False, use_selection=False)
print('[autorig] wrote', dst)

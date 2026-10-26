// counts cruel/kind answers for the ending

export const fate = {
  cruel: 0,
  kind: 0,
  reset() { this.cruel = 0; this.kind = 0; },
  /** 'tyrant' | 'mentor' | 'balance' */
  get ending() { return this.cruel > this.kind ? 'tyrant' : this.kind > this.cruel ? 'mentor' : 'balance'; },
};

// Keadaan bersama: pengguna yang sedang masuk dan data referensi.
import { api } from "./ui.js";

export const store = {
  user: null,
  userChecked: false,
  ref: null,
  afterLogin: null,
  sesiHabis: false,
  onLogin: null,

  async loadRef(force = false) {
    if (!this.ref || force) this.ref = await api("/api/referensi");
    return this.ref;
  },
  zat(key) {
    return this.ref?.zat_gizi?.[key] || { nama: key, satuan: "" };
  },
  reset() {
    this.user = null;
    this.ref = null;
    this.userChecked = true;
  },
};

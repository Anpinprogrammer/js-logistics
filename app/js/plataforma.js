/* Conexión con Firebase: ingreso, base de datos y descargas.
   Expone window.plataforma con la misma forma que usaba la versión de claude.ai,
   para que app.js casi no cambie. Cuando termina, carga app.js. */
import { firebaseConfig } from "./firebase-config.js";

const V = "10.12.2";
const URL_FB = n => `https://www.gstatic.com/firebasejs/${V}/firebase-${n}.js`;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

/* ---------- descargas: un enlace temporal en el navegador ---------- */
const descargas = {
  async save({filename, data}){
    const blob = data instanceof Blob ? data : new Blob([data], {type: "text/plain;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
};

function cargarApp(){
  const s = document.createElement("script"); s.src = "js/app.js"; document.body.appendChild(s);
}
function quitarSplash(){ const sp = $("#splash"); if(sp){ sp.classList.add("fuera"); setTimeout(() => sp.remove(), 400); } }

/* ---------- modo de prueba: sin Firebase configurado ---------- */
if(!firebaseConfig.apiKey){
  window.plataforma = { db: null, usuario: null, descargas, modoPrueba: true };
  cargarApp();
} else {
  iniciar().catch(e => { console.error(e); mostrarError("No se pudo conectar con el servidor. Revisa tu conexión a internet y vuelve a abrir la app."); });
}

async function iniciar(){
  const [{ initializeApp, deleteApp }, A, F] = await Promise.all([import(URL_FB("app")), import(URL_FB("auth")), import(URL_FB("firestore"))]);
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  const fs = F.initializeFirestore(app, { ignoreUndefinedProperties: true });

  /* --- adaptador de base de datos con la forma de la versión anterior --- */
  const snapDocs = s => ({ docs: s.docs.map(d => ({ id: d.id, data: () => d.data() })) });
  const refDoc = r => ({
    set: (d, o) => o ? F.setDoc(r, d, o) : F.setDoc(r, d),
    update: d => F.updateDoc(r, d),
    delete: () => F.deleteDoc(r),
    get: async () => { const s = await F.getDoc(r); return { exists: s.exists(), data: () => s.data() }; }
  });
  const refCol = (ruta, cons = []) => ({
    doc: id => refDoc(F.doc(fs, ruta, id)),
    where: (f, o, v) => refCol(ruta, [...cons, F.where(f, o, v)]),
    orderBy: (f, dir) => refCol(ruta, [...cons, F.orderBy(f, dir)]),
    limit: n => refCol(ruta, [...cons, F.limit(n)]),
    get: async () => snapDocs(await F.getDocs(F.query(F.collection(fs, ruta), ...cons))),
    onSnapshot: (ok, err) => F.onSnapshot(F.query(F.collection(fs, ruta), ...cons), s => ok(snapDocs(s)), err)
  });
  const db = {
    collection: ruta => refCol(ruta),
    doc: ruta => refDoc(F.doc(fs, ruta)),
    /* número de guía consecutivo, seguro aunque dos mensajeros creen pedidos a la vez */
    siguienteContador: () => F.runTransaction(fs, async t => {
      const r = F.doc(fs, "meta", "contador"); const s = await t.get(r);
      const n = ((s.exists() && s.data().n) || 0) + 1; t.set(r, { n }); return n;
    }),
    /* Número de guía, pedido y foto de salida en una sola operación: si la guía ya existe, no se toca nada. */
    crearPedido: armar => F.runTransaction(fs, async t => {
      const rc = F.doc(fs, "meta", "contador"); const sc = await t.get(rc);
      const n = ((sc.exists() && sc.data().n) || 0) + 1;
      const { guia, pedido, foto } = armar(n);
      const rp = F.doc(fs, "pedidos", guia);
      if((await t.get(rp)).exists()) throw new Error("La guía " + guia + " ya existe");
      t.set(rc, { n }); t.set(rp, pedido);
      if(foto) t.set(F.doc(fs, "fotos", guia), { salida: foto });
      return guia;
    })
  };

  /* --- cuentas de la app --- */
  async function crearAcceso({ email, clave, nombre, rol, mensajeroId, clienteId }){
    // Se usa una segunda conexión para que el administrador no pierda su sesión al crear la cuenta.
    const sec = initializeApp(firebaseConfig, "alta-" + Date.now());
    try{
      const c = await A.createUserWithEmailAndPassword(A.getAuth(sec), email, clave);
      const id = c.user.uid, b = F.writeBatch(fs);
      b.set(F.doc(fs, "usuarios", id), { uid: id, email, nombre, rol, ...(clienteId ? { clienteId } : {}), creado: Date.now() });
      if(rol === "admin") b.set(F.doc(fs, "admins", id), { uid: id });
      if(mensajeroId) b.set(F.doc(fs, "vinculos", id), { uid: id, mensajeroId, fecha: Date.now() });
      await b.commit();
      await A.signOut(A.getAuth(sec));
      return id;
    } finally { await deleteApp(sec); }
  }
  async function quitarAcceso(id){
    const b = F.writeBatch(fs);
    b.delete(F.doc(fs, "usuarios", id)); b.delete(F.doc(fs, "admins", id)); b.delete(F.doc(fs, "vinculos", id));
    await b.commit();
  }
  async function cambiarRol(id, rol){
    const b = F.writeBatch(fs);
    b.update(F.doc(fs, "usuarios", id), { rol });
    if(rol === "admin") b.set(F.doc(fs, "admins", id), { uid: id }); else b.delete(F.doc(fs, "admins", id));
    await b.commit();
  }
  const vincular = (id, mensajeroId) => mensajeroId
    ? F.setDoc(F.doc(fs, "vinculos", id), { uid: id, mensajeroId, fecha: Date.now() })
    : F.deleteDoc(F.doc(fs, "vinculos", id));
  const enviarCambioClave = email => A.sendPasswordResetEmail(auth, email);

  /* --- importar un respaldo {coleccion:{id:documento}} --- */
  async function importar(datos, alAvanzar){
    const filas = [];
    for(const [col, docs] of Object.entries(datos)){
      if(["vinculos", "usuarios", "admins"].includes(col) || col.includes("/")) continue;
      for(const [id, d] of Object.entries(docs || {})) if(d && typeof d === "object") filas.push([col, id, d]);
    }
    let hechos = 0, b = F.writeBatch(fs), tam = 0, n = 0;
    for(const [col, id, d] of filas){
      const peso = JSON.stringify(d).length;
      if(n >= 400 || tam + peso > 8e6){ await b.commit(); b = F.writeBatch(fs); n = 0; tam = 0; }
      b.set(F.doc(fs, col, id), d); n++; tam += peso; hechos++;
      if(alAvanzar) alAvanzar(hechos, filas.length);
    }
    if(n) await b.commit();
    return hechos;
  }

  /* --- sesión --- */
  let usuarioActual = null, arrancada = false, enInicial = false;
  A.onAuthStateChanged(auth, async u => {
    if(enInicial) return;
    if(!u){ if(arrancada){ location.reload(); return; } quitarSplash(); mostrarIngreso(); return; }
    if(arrancada) return;
    try{
      const [miembro, admin, vinculo] = await Promise.all(["usuarios", "admins", "vinculos"].map(c => F.getDoc(F.doc(fs, c, u.uid))));
      if(!miembro.exists()){ quitarSplash(); mostrarSinAcceso(u.email); return; }
      usuarioActual = { uid: u.uid, email: u.email, admin: admin.exists(), datos: miembro.data(), mensajeroId: vinculo.exists() ? vinculo.data().mensajeroId : "" };
    }catch(e){ console.error(e); quitarSplash(); mostrarSinAcceso(u.email); return; }
    arrancada = true;
    $("#acceso")?.remove();
    const salir = $("#btnSalir"); salir.classList.remove("oculto"); salir.title = "Cerrar sesión de " + u.email;
    salir.onclick = () => A.signOut(auth);
    window.plataforma = {
      db, descargas, modoPrueba: false,
      usuario: {
        id: async () => usuarioActual.uid,
        canEdit: async () => usuarioActual.admin,
        rol: () => usuarioActual.admin ? "admin" : (usuarioActual.datos.rol || "mensajero"),
        mensajeroId: () => usuarioActual.mensajeroId,
        clienteId: () => usuarioActual.datos.clienteId || "",
        email: () => usuarioActual.email,
        nombre: () => usuarioActual.datos.nombre || usuarioActual.email || "",
        profiles: async ids => {
          const out = {};
          await Promise.all(ids.map(async id => { try{ const s = await F.getDoc(F.doc(fs, "usuarios", id)); if(s.exists()) out[id] = { name: s.data().nombre || s.data().email }; }catch(e){} }));
          return out;
        }
      },
      cuentas: { crear: crearAcceso, quitar: quitarAcceso, cambiarRol, vincular, cambiarClave: enviarCambioClave },
      importar
    };
    cargarApp();
  });

  /* --- pantallas de ingreso --- */
  function pantalla(html){
    let c = $("#acceso"); if(!c){ c = document.createElement("section"); c.id = "acceso"; c.className = "acceso"; document.body.appendChild(c); }
    c.innerHTML = `<div class="acceso-caja"><img src="img/logo-splash.png" alt=""><h1>JS Logistics</h1>${html}</div>`;
    return c;
  }
  function errorTexto(e){
    const c = e?.code || "";
    if(c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found")) return "Correo o contraseña incorrectos.";
    if(c.includes("too-many-requests")) return "Demasiados intentos. Espera unos minutos.";
    if(c.includes("network")) return "Sin conexión a internet.";
    if(c.includes("email-already-in-use")) return "Ese correo ya tiene una cuenta.";
    if(c.includes("weak-password")) return "La contraseña debe tener al menos 6 caracteres.";
    if(c.includes("invalid-email")) return "El correo no es válido.";
    if(c.includes("permission-denied")) return "La configuración inicial ya se hizo. Ingresa con tu cuenta.";
    return "Algo salió mal. Intenta de nuevo.";
  }
  function mostrarIngreso(){
    const c = pantalla(`<p class="sub">Ingresa con el correo y la contraseña que te dio el administrador.</p>
      <form id="fIngreso"><div class="campo"><label for="aEmail">Correo</label><input id="aEmail" type="email" autocomplete="username" required></div>
      <div class="campo"><label for="aClave">Contraseña</label><input id="aClave" type="password" autocomplete="current-password" required></div>
      <p class="acceso-error" id="aErr" role="alert"></p>
      <button class="btn" style="width:100%">Ingresar</button></form>
      <div class="acceso-links"><button class="enlace" id="aOlvido">Olvidé mi contraseña</button><button class="enlace" id="aInicial">Configuración inicial</button></div>`);
    c.querySelector("#fIngreso").onsubmit = async ev => {
      ev.preventDefault(); const btn = ev.target.querySelector("button"); btn.disabled = true; $("#aErr").textContent = "";
      try{ await A.signInWithEmailAndPassword(auth, $("#aEmail").value.trim(), $("#aClave").value); }
      catch(e){ $("#aErr").textContent = errorTexto(e); btn.disabled = false; }
    };
    $("#aOlvido").onclick = async () => {
      const em = $("#aEmail").value.trim(); if(!em){ $("#aErr").textContent = "Escribe tu correo arriba y vuelve a tocar “Olvidé mi contraseña”."; return; }
      try{ await A.sendPasswordResetEmail(auth, em); $("#aErr").textContent = "Te enviamos un correo para crear una contraseña nueva."; }
      catch(e){ $("#aErr").textContent = errorTexto(e); }
    };
    $("#aInicial").onclick = mostrarInicial;
  }
  function mostrarInicial(){
    const c = pantalla(`<p class="sub">Solo la primera vez: crea la cuenta del administrador. Después, las cuentas de los mensajeros se crean desde Administración → Más → Personal.</p>
      <form id="fIni"><div class="campo"><label for="iNom">Tu nombre</label><input id="iNom" required></div>
      <div class="campo"><label for="iEmail">Correo</label><input id="iEmail" type="email" autocomplete="username" required></div>
      <div class="campo"><label for="iClave">Contraseña (mínimo 6 caracteres)</label><input id="iClave" type="password" autocomplete="new-password" minlength="6" required></div>
      <p class="acceso-error" id="aErr" role="alert"></p>
      <button class="btn" style="width:100%">Crear administrador</button></form>
      <div class="acceso-links"><button class="enlace" id="aVolver">Volver</button></div>`);
    $("#aVolver").onclick = mostrarIngreso;
    c.querySelector("#fIni").onsubmit = async ev => {
      ev.preventDefault(); const btn = ev.target.querySelector("button"); btn.disabled = true; $("#aErr").textContent = "";
      let cred = null;
      try{
        enInicial = true; // la sesión nueva no debe abrir la app hasta tener sus permisos
        cred = await A.createUserWithEmailAndPassword(auth, $("#iEmail").value.trim(), $("#iClave").value);
        const id = cred.user.uid, b = F.writeBatch(fs);
        b.set(F.doc(fs, "meta", "config"), { primerAdmin: id, creado: Date.now() });
        b.set(F.doc(fs, "admins", id), { uid: id });
        b.set(F.doc(fs, "usuarios", id), { uid: id, email: cred.user.email, nombre: $("#iNom").value.trim(), rol: "admin", creado: Date.now() });
        await b.commit();
        location.reload();
      }catch(e){
        console.error(e);
        if(cred){ try{ await cred.user.delete(); }catch(_){ await A.signOut(auth); } }
        enInicial = false;
        $("#aErr").textContent = errorTexto(e); btn.disabled = false;
      }
    };
  }
  function mostrarSinAcceso(email){
    pantalla(`<p class="sub">La cuenta <b>${esc(email)}</b> no tiene acceso a la app. Pídele al administrador que te cree un acceso.</p>
      <button class="btn" id="aOtra" style="width:100%">Ingresar con otra cuenta</button>`);
    $("#aOtra").onclick = () => A.signOut(auth).then(() => location.reload());
  }
}

function mostrarError(msg){
  quitarSplash();
  const c = document.createElement("section"); c.className = "acceso"; c.id = "acceso";
  c.innerHTML = `<div class="acceso-caja"><img src="img/logo-splash.png" alt=""><h1>JS Logistics</h1><p class="sub">${esc(msg)}</p><button class="btn" onclick="location.reload()">Reintentar</button></div>`;
  document.body.appendChild(c);
}

/* ---------- instalación como app ---------- */
if("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});

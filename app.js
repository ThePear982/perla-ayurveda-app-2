/* =====================================================
   PERLA AYURVEDA · FISIOTERAPIA — app.js
   ===================================================== */

import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  createUserWithEmailAndPassword, sendPasswordResetEmail, updatePassword,
  reauthenticateWithCredential, EmailAuthProvider }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "perla-ayurveda.firebaseapp.com",
  projectId: "perla-ayurveda",
  storageBucket: "perla-ayurveda.firebasestorage.app",
  messagingSenderId: "19756679359",
  appId: "TU_APP_ID",
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

/* ---------- ESTADO GENERAL ---------- */
const COLECCIONES = ["clientes", "servicios", "paquetes", "ventas", "citas", "atenciones"];
let ultimoGuardado = {};
let colaGuardado = Promise.resolve();
let avisoLogin = "";

/* ---------- UTILIDADES ---------- */
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const soles = (n) => "S/ " + (+n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pad = (n) => String(n).padStart(2, "0");
const aISO = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const hoy = () => aISO(new Date());
const sumarDias = (iso, n) => { const d = new Date(iso + "T00:00"); d.setDate(d.getDate() + n); return aISO(d); };
const manana = () => sumarDias(hoy(), 1);
const diasEntre = (iso) => Math.round((new Date(iso + "T00:00") - new Date(hoy() + "T00:00")) / 864e5);
const fCorta = (s) => (s ? new Date(s + "T00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" }) : "");
const fDia = (s) => new Date(s + "T00:00").toLocaleDateString("es-PE", { weekday: "short", day: "numeric", month: "short" });
const hora12 = (h) => { const [a, b] = h.split(":").map(Number); return (a % 12 || 12) + (b ? ":" + pad(b) : "") + (a < 12 ? " am" : " pm"); };
const aMin = (h) => { const [a, b] = h.split(":").map(Number); return a * 60 + b; };
const aHora = (m) => pad(Math.floor(m / 60)) + ":" + pad(m % 60);
const minutosAhora = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const telWA = (t) => { const n = String(t || "").replace(/\D/g, ""); return n.length === 9 && n[0] === "9" ? "51" + n : n.length === 11 && n.startsWith("51") ? n : ""; };
const nombreCorto = (nombre) => { const n = String(nombre).split(" ")[0]; return n.charAt(0) + n.slice(1).toLowerCase(); };
const inicioSemana = () => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return aISO(d); };
const finSemana = () => sumarDias(inicioSemana(), 6);
const RANGOS = () => {
  const h = hoy();
  return {
    dia: [h, h], semana: [inicioSemana(), finSemana()],
    mes: [h.slice(0, 7) + "-01", h.slice(0, 7) + "-31"], anio: [h.slice(0, 4) + "-01-01", h.slice(0, 4) + "-12-31"],
  };
};

/* ---------- SECCIONES Y PERMISOS ---------- */
const SECCIONES = [["hoy", "Hoy"], ["sala", "Sala en vivo"], ["inicio", "Resumen"], ["citas", "Citas"],
  ["clientes", "Clientes"], ["nuevos", "Pacientes nuevos"], ["servicios", "Servicios"], ["paquetes", "Paquetes"], ["porfinalizar", "Por finalizar"], ["finalizaron", "Finalizaron"], ["ganancias", "Ganancias"]];
const ETQ_SEC = Object.fromEntries([...SECCIONES, ["configuracion", "Configuración"]]);

let USUARIOS = [];

let YO = null;
const puede = (sec) => !!YO && (YO.owner || (YO.permisos || []).includes(sec));
const secciones = () => [...SECCIONES.map((s) => s[0]).filter(puede), ...(YO && YO.owner ? ["configuracion"] : [])];

/* ---------- DATOS ---------- */
const AJUSTES_DEF = { clinica: "Perla Ayurveda", inicio: "08:00", fin: "20:00", paso: 30,
  duracionDefault: 60, vigenciaDias: 90, novinoConsume: true, recursos: ["Sala 1", "Sala 2"],
  formularioUrl: "", formularioMin: 5, avisoSesiones: 2 };
let D = {};


function normalizar() {
  ["clientes", "servicios", "paquetes", "atenciones", "citas", "ventas"].forEach((k) => { D[k] ||= []; });
  D.ajustes = { ...AJUSTES_DEF, ...(D.ajustes || {}) };
  if (!D.ajustes.recursos || !D.ajustes.recursos.length) D.ajustes.recursos = ["Sala 1"];
  D.servicios.forEach((s) => { s.duracion = +s.duracion || D.ajustes.duracionDefault; });
  D.ventas.forEach((v) => {
    if (!v.abonos) v.abonos = [{ fecha: v.fecha, monto: +v.precio || 0, metodo: "Pago completo" }];
    if (!v.vence) v.vence = sumarDias(v.fecha, D.ajustes.vigenciaDias);
  });
  D.clientes.forEach((c) => { c.ficha ||= {}; });
  D.seguim ||= {}; D.seguim.manual ||= []; D.seguim.marcas ||= {};
  D.citas.forEach((c) => { c.recurso ||= D.ajustes.recursos[0]; });
}
// Primera vez: toma lo que hay en este navegador (localStorage), solo para migrar
function datosIniciales() {
  const local = JSON.parse(localStorage.getItem("fisio_datos2") || "null");
  if (local) return local;
  return { clientes: [], servicios: [], paquetes: [], atenciones: [], citas: [], ventas: [],
    ajustes: {}, seguim: {}, formVistos: [], sembrados: [] };
}

const conIds = (lista) => { lista.forEach((x) => { if (!x.id) x.id = uid(); }); return lista; };
const partesConfig = () => ({ ajustes: D.ajustes, formVistos: D.formVistos, sembrados: D.sembrados });

async function cargarColeccion(nombre) {
  const snap = await getDocs(collection(db, nombre));
  const lista = [];
  snap.forEach((d) => lista.push({ ...d.data(), id: d.id }));
  return lista;
}

// Recuerda lo que ya está en la nube para enviar después solo los cambios
function registrarEstado() {
  ultimoGuardado = {};
  COLECCIONES.forEach((c) => D[c].forEach((x) => { ultimoGuardado[c + "/" + x.id] = JSON.stringify(x); }));
  ultimoGuardado["clinica/ajustes"] = JSON.stringify(partesConfig());
  ultimoGuardado["clinica/seguimiento"] = JSON.stringify(D.seguim);
}

async function cargarDatosDeLaNube() {
  const [cfgSnap, segSnap] = await Promise.all([
    getDoc(doc(db, "clinica", "ajustes")),
    getDoc(doc(db, "clinica", "seguimiento")),
  ]);

  if (!cfgSnap.exists()) {
    // Primera vez: no hay nada en la nube, se sube lo que tienes en este navegador
    D = datosIniciales();
    COLECCIONES.forEach((c) => conIds(D[c] ||= []));
    normalizar();
    if (!(await guardarCambios(true))) throw new Error("No se pudieron subir los datos iniciales");
    registrarEstado();
    return;
  }

  const cfg = cfgSnap.data();
  D = {
    ajustes: cfg.ajustes || {}, formVistos: cfg.formVistos || [], sembrados: cfg.sembrados || [],
    seguim: segSnap.exists() ? segSnap.data() : {},
  };
  for (const c of COLECCIONES) D[c] = await cargarColeccion(c);
  COLECCIONES.forEach((c) => conIds(D[c]));
  normalizar();
  registrarEstado();
}

// Envía a Firestore solo los registros que cambiaron (o todo, la primera vez)
async function guardarCambios(todo = false) {
  const ops = [], nuevo = {};
  const marcar = (ruta, datos, ref) => {
    const txt = JSON.stringify(datos);
    nuevo[ruta] = txt;
    if (todo || ultimoGuardado[ruta] !== txt) ops.push({ ref, datos: JSON.parse(txt) });
  };

  COLECCIONES.forEach((c) => D[c].forEach((x) => marcar(c + "/" + x.id, x, doc(db, c, x.id))));
  marcar("clinica/ajustes", partesConfig(), doc(db, "clinica", "ajustes"));
  marcar("clinica/seguimiento", D.seguim, doc(db, "clinica", "seguimiento"));

  // Registros que estaban en la nube y ya no existen aquí → se borran
  Object.keys(ultimoGuardado).forEach((ruta) => {
    if (nuevo[ruta] !== undefined) return;
    const [col, id] = ruta.split("/");
    ops.push({ ref: doc(db, col, id), datos: null });
    nuevo[ruta] = null;
  });

  try {
    for (let i = 0; i < ops.length; i += 450) { // Firestore acepta hasta 500 operaciones por lote
      const lote = writeBatch(db);
      ops.slice(i, i + 450).forEach((o) => (o.datos === null ? lote.delete(o.ref) : lote.set(o.ref, o.datos)));
      await lote.commit();
    }
    for (const [ruta, txt] of Object.entries(nuevo)) {
      if (txt === null) delete ultimoGuardado[ruta];
      else ultimoGuardado[ruta] = txt;
    }
    return true;
  } catch (err) {
    console.error("Error al guardar en la nube:", err);
    return false;
  }
}

// Reemplaza al guardar() anterior. Los guardados se hacen en orden para que no se pisen.
async function guardar() {
  colaGuardado = colaGuardado.then(() => guardarCambios());
  if (!(await colaGuardado)) aviso("No se pudo guardar en la nube. Revisa tu conexión a internet.");
}

/* ---------- FORMULARIO DE GOOGLE: PACIENTES NUEVOS ---------- */
// Registros del formulario que ya estaban en tu hoja (16 al 19 de noviembre de 2026).
// Se agregan una sola vez. Teléfono y distrito se completan solos al conectar el enlace.
const DE_FORMULARIO = [
  { dni: "76148019", nombre: "CARLOS HUAROTE CADENILLAS", sexo: "Hombre", nacimiento: "1997-12-02", correo: "CARLOHUARTOTE15@GMAIL.COM", direccion: "AV. UNION 477", registro: "2026-11-16", hora: "12:01" },
  { dni: "70454267", nombre: "GUADALUPE VASQUEZ ZUÑIGA", sexo: "Mujer", nacimiento: "1997-02-25", correo: "", direccion: "UPIS DEL CARMEN", registro: "2026-11-16", hora: "16:55" },
  { dni: "40171154", nombre: "PATRICIA QUIJANDRIA SABASTIZAGA", sexo: "Mujer", nacimiento: "1979-05-27", correo: "PPQUIJANDRIA@YAHOO.COM", direccion: "", registro: "2026-11-17", hora: "09:07" },
  { dni: "49430346", nombre: "JESUS LEONARDO SARAVIA CAMACHO", sexo: "Hombre", nacimiento: "1994-07-08", correo: "GENOELISABET29@GMAIL.COM", direccion: "AV UNION 145", registro: "2026-11-17", hora: "15:19" },
  { dni: "21857492", nombre: "EDNA MARISOL YATACO YALLE", sexo: "Mujer", nacimiento: "1968-10-25", correo: "ADNAMARISOLYATACOYALLE@GAMIL.COM", direccion: "", registro: "2026-11-18", hora: "11:41" },
  { dni: "999999999", nombre: "LISA CASTRO OLIVA", sexo: "Mujer", nacimiento: "1976-01-15", correo: "LISA5472C@GMAIL.COM", direccion: "EL OTRO SITIO", registro: "2026-11-18", hora: "17:27" },
  { dni: "40021247", nombre: "LUIS EUGENIO CRUZ TABOADA", sexo: "Hombre", nacimiento: "1978-10-24", correo: "", direccion: "JR CAÑETE 145", registro: "2026-11-19", hora: "20:34" },
];

const dniDudoso = (d) => !/^\d{8}$/.test(d || "") || /^(\d)\1+$/.test(d);

// Agrega los clientes nuevos (por DNI) y completa campos vacíos de los que ya existen.
function fusionarClientes(lista, fuente) {
  D.formVistos ||= [];
  let nuevos = 0, completados = 0;
  lista.forEach((r) => {
    const dni = String(r.dni || "").replace(/\D/g, "");
    if (!dni || !r.nombre) return;
    const ex = D.clientes.find((c) => c.dni === dni);
    if (ex) {
      let toco = false;
      ["telefono", "correo", "direccion", "distrito", "nacimiento", "sexo", "origen"].forEach((k) => {
        if (!ex[k] && r[k]) { ex[k] = r[k]; toco = true; }
      });
      if (toco) completados++;
      if (!D.formVistos.includes(dni)) D.formVistos.push(dni);
      return;
    }
    if (D.formVistos.includes(dni)) return; // ya lo habías eliminado: no se vuelve a agregar
    D.clientes.push({
      id: uid(), dni, nombre: r.nombre.trim().toUpperCase(), sexo: r.sexo || "", nacimiento: r.nacimiento || "",
      telefono: r.telefono || "", correo: r.correo || "", direccion: r.direccion || "", distrito: r.distrito || "",
      origen: r.origen || "", registro: r.registro || hoy(), registroHora: r.hora || "", consentimiento: "",
      fuente, ficha: {},
    });
    D.formVistos.push(dni);
    nuevos++;
  });
  return { nuevos, completados };
}

function sembrarFormulario() {
  D.sembrados ||= [];
  if (D.sembrados.includes("form-nov-2026")) return;
  fusionarClientes(DE_FORMULARIO, "formulario");
  D.sembrados.push("form-nov-2026");
  guardar();
}

// Lector de CSV (comas, comillas y saltos de línea dentro de una celda)
function parseCSV(txt, sep = ",") {
  const filas = []; let f = [], c = "", q = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (q) { if (ch === '"') { if (txt[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { f.push(c); c = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && txt[i + 1] === "\n") i++; f.push(c); filas.push(f); f = []; c = ""; }
    else c += ch;
  }
  if (c !== "" || f.length) { f.push(c); filas.push(f); }
  return filas;
}

function fechaISO(t) { // "16/11/2026 12:01:08", "2026-11-16" o "11/16/2026"
  const s = String(t || "").trim(); let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  if ((m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/))) {
    let dia = +m[1], mes = +m[2];
    if (mes > 12 && dia <= 12) [dia, mes] = [mes, dia];
    return `${m[3]}-${pad(mes)}-${pad(dia)}`;
  }
  return "";
}
const titulo = (t) => String(t || "").toLowerCase().replace(/(^|\s)\S/g, (x) => x.toUpperCase());

// Convierte las filas de la hoja de respuestas en clientes
function filasAClientes(filas) {
  const hi = filas.findIndex((f) => f.some((c) => /dni/.test(norm(c))) && f.some((c) => /nombre/.test(norm(c))));
  if (hi < 0) throw new Error("No encontré las columnas DNI y nombre. ¿Es la hoja de respuestas del formulario?");
  const cab = filas[hi].map(norm);
  const col = (re) => cab.findIndex((h) => re.test(h));
  const ix = { ts: col(/marca|timestamp|fecha y hora/), nombre: col(/nombre/), dni: col(/dni/), sexo: col(/sexo|genero/),
    nac: col(/nacimiento/), correo: col(/correo|email/), dir: col(/direccion/), dist: col(/distrito/),
    tel: col(/telefono|celular|whatsapp/), origen: col(/enter|conoci/) };
  const v = (f, k) => (ix[k] >= 0 && f[ix[k]] != null ? String(f[ix[k]]).trim() : "");
  return filas.slice(hi + 1).map((f) => {
    const hm = v(f, "ts").match(/(\d{1,2}):(\d{2})/);
    return { dni: v(f, "dni").replace(/\D/g, ""), nombre: v(f, "nombre"), sexo: titulo(v(f, "sexo")),
      nacimiento: fechaISO(v(f, "nac")), correo: v(f, "correo"), direccion: v(f, "dir"), distrito: titulo(v(f, "dist")),
      telefono: v(f, "tel").replace(/[^\d+]/g, ""), origen: titulo(v(f, "origen")),
      registro: fechaISO(v(f, "ts")) || hoy(), hora: hm ? pad(hm[1]) + ":" + hm[2] : "" };
  }).filter((r) => r.dni && r.nombre);
}

let sync = { estado: "", ultima: 0, cargando: false };
const syncHTML = () => {
  const url = (D.ajustes.formularioUrl || "").trim();
  if (!url) return `<strong>Lectura automática desactivada.</strong> ${YO && YO.owner
    ? '<button type="button" class="btn secundario" data-irconfig="1">Conectar el formulario</button>'
    : "Pide a la administradora que conecte el formulario."}`;
  const hora = sync.ultima ? new Date(sync.ultima).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }) : "—";
  return `<strong>Conectado al formulario.</strong> ${sync.cargando ? "Actualizando…" : sync.estado.startsWith("error")
    ? '<span class="error">' + esc(sync.estado) + "</span>" : "Última lectura: " + hora + "."}
    <button type="button" class="btn secundario" data-sync="1">Actualizar ahora</button>`;
};
const refrescarSync = () => { const el = $("#syncEstado"); if (el) el.innerHTML = syncHTML(); };

async function sincronizarFormulario(manual) {
  const url = (D.ajustes.formularioUrl || "").trim();
  if (!url) { if (manual) aviso("Primero pega el enlace del formulario en Configuración."); return; }
  if (sync.cargando) return;
  sync.cargando = true; refrescarSync();
  try {
    const r = await fetch(url + (url.includes("?") ? "&" : "?") + "t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) throw new Error("El enlace respondió con error " + r.status + ".");
    const res = fusionarClientes(filasAClientes(parseCSV(await r.text())), "formulario");
    guardar();
    sync.ultima = Date.now(); sync.estado = "ok";
    if (res.nuevos) aviso(res.nuevos + (res.nuevos === 1 ? " paciente nuevo" : " pacientes nuevos") + " del formulario");
    else if (manual) aviso("Todo al día: no hay pacientes nuevos");
  } catch (err) {
    sync.estado = "error: " + (err.message && !/fetch/i.test(err.message) ? err.message
      : "no se pudo leer el enlace. Revisa que esté publicado en la web como CSV.");
  } finally {
    sync.cargando = false; refrescarSync();
    if (YO && !$("#panel").hidden && $("#modal").hidden && ["nuevos", "clientes", "inicio"].includes(pestanaActual)) render();
  }
}

// Importación manual (sin enlace): archivo CSV o filas copiadas desde la hoja
function importarTexto(txt) {
  const sep = txt.includes("\t") ? "\t" : ",";
  const res = fusionarClientes(filasAClientes(parseCSV(txt, sep)), "formulario");
  guardar();
  return res;
}

/* ---------- CONSULTAS ---------- */
const C = (id) => D.clientes.find((c) => c.id === id) || { nombre: "(cliente eliminado)", dni: "", telefono: "" };
const S = (id) => D.servicios.find((s) => s.id === id) || { nombre: "(servicio eliminado)", precio: 0 };
const durSrv = (id) => +S(id).duracion || D.ajustes.duracionDefault;
const nombreAt = (a) => (a.pacienteId ? C(a.pacienteId).nombre : a.nombre) || "Sin nombre";
const clientesOrdenados = () => D.clientes.slice().sort((a, b) => a.nombre.localeCompare(b.nombre));

const ESTADO = { pendiente: "Pendiente", llego: "Llegó", atendida: "Atendida", novino: "No vino",
  cancelada: "Cancelada", reprogramada: "Reprogramada" };
const ETQ = { terapia: "Terapia", sesion: "Sesión de paquete", paquete: "Compra de paquete", compra: "Compra",
  reprogramo: "Reprogramó", cancelo: "Canceló", sindato: "Sin detalle", cita: "Cita atendida" };
const LIBRES_HORARIO = ["cancelada", "reprogramada", "novino"];
const ocupaHorario = (c) => !LIBRES_HORARIO.includes(c.estado);
// Una sesión de paquete queda reservada mientras la cita esté activa
const reservaSesion = (c) => !!c.ventaId && (["pendiente", "llego", "atendida"].includes(c.estado) ||
  (c.estado === "novino" && D.ajustes.novinoConsume));
const usadasDe = (v) => D.citas.filter((c) => c.ventaId === v.id &&
  (c.estado === "atendida" || (c.estado === "novino" && D.ajustes.novinoConsume))).length;
const programadasDe = (v) => D.citas.filter((c) => c.ventaId === v.id && ["pendiente", "llego"].includes(c.estado)).length;
const restantes = (v) => v.sesiones - D.citas.filter((c) => c.ventaId === v.id && reservaSesion(c)).length;
const pagado = (v) => (v.abonos || []).reduce((s, a) => s + (+a.monto || 0), 0);
const saldoDe = (v) => Math.max(0, (+v.precio || 0) - pagado(v));
const vencido = (v) => v.vence < hoy();
const ventasActivas = (cid) => D.ventas.filter((v) => (!cid || v.pacienteId === cid) && restantes(v) > 0 && !vencido(v));
const citasDe = (f) => D.citas.filter((c) => c.fecha === f && !["cancelada", "reprogramada"].includes(c.estado))
  .sort((a, b) => a.hora.localeCompare(b.hora));
const esTerapia = (x) => ["terapia", "sesion", "cita"].includes(x.tipo);
const total = (m) => m.reduce((s, x) => s + x.monto, 0);

function srvFrecuentes() {
  const cnt = {}, porNombre = {};
  D.servicios.forEach((s) => { cnt[s.id] = 0; porNombre[norm(s.nombre)] = s.id; });
  D.atenciones.forEach((a) => { const id = porNombre[norm(a.servicio)]; if (id) cnt[id]++; });
  D.citas.forEach((c) => { if (c.servicioId in cnt) cnt[c.servicioId]++; });
  return D.servicios.slice().sort((a, b) => cnt[b.id] - cnt[a.id]);
}

// Dinero que entró entre dos fechas: atenciones del Excel, citas sueltas y abonos de paquetes
function movimientos(desde, hasta) {
  const m = [];
  const dentro = (f) => f >= desde && f <= hasta;
  D.atenciones.forEach((a) => {
    if (a.total > 0 && dentro(a.fecha)) m.push({ fecha: a.fecha, texto: nombreAt(a) + " · " + (a.servicio || ETQ[a.tipo]), monto: +a.total });
  });
  D.citas.forEach((c) => {
    if (c.estado === "atendida" && !c.ventaId && dentro(c.fecha))
      m.push({ fecha: c.fecha, texto: C(c.pacienteId).nombre + " · " + S(c.servicioId).nombre + (c.pago ? " · " + c.pago : ""), monto: +c.precio });
  });
  D.ventas.forEach((v) => (v.abonos || []).forEach((ab) => {
    if (dentro(ab.fecha)) m.push({ fecha: ab.fecha, texto: "Abono · " + C(v.pacienteId).nombre + " · " + v.nombre + (ab.metodo ? " · " + ab.metodo : ""), monto: +ab.monto });
  }));
  return m.filter((x) => x.monto > 0).sort((a, b) => b.fecha.localeCompare(a.fecha));
}

function historial(cid) {
  const h = [];
  D.atenciones.filter((a) => a.pacienteId === cid).forEach((a) =>
    h.push({ fecha: a.fecha, servicio: a.servicio || "—", tipo: a.tipo, obs: a.obs, total: a.total, pago: a.pago }));
  D.citas.filter((c) => c.pacienteId === cid && c.estado === "atendida").forEach((c) =>
    h.push({ fecha: c.fecha, servicio: S(c.servicioId).nombre, tipo: "cita", obs: c.ventaId ? "Con paquete" : "", total: c.ventaId ? 0 : +c.precio, pago: c.pago || "" }));
  D.ventas.filter((v) => v.pacienteId === cid).forEach((v) =>
    h.push({ fecha: v.fecha, servicio: "Paquete " + v.nombre, tipo: "paquete", obs: `${v.sesiones} sesiones · vence ${fCorta(v.vence)}`, total: pagado(v), pago: "" }));
  return h.sort((a, b) => b.fecha.localeCompare(a.fecha));
}

function proxCumple(c) {
  if (!c.nacimiento) return null;
  const [y, m, d] = c.nacimiento.split("-").map(Number);
  const h = new Date(hoy() + "T00:00");
  let n = new Date(h.getFullYear(), m - 1, d);
  if (n < h) n = new Date(h.getFullYear() + 1, m - 1, d);
  return { dias: Math.round((n - h) / 864e5), edad: n.getFullYear() - y, fecha: n };
}
const cumpleanios = () => D.clientes.map((c) => ({ c, k: proxCumple(c) }))
  .filter((x) => x.k && x.k.dias <= 30).sort((a, b) => a.k.dias - b.k.dias);

/* ---------- MENSAJES DE WHATSAPP ---------- */
const urlWA = (c) => "https://wa.me/" + telWA(C(c.pacienteId).telefono) + "?text=" +
  encodeURIComponent(`Hola ${nombreCorto(C(c.pacienteId).nombre)}, te esperamos mañana a las ${hora12(c.hora)} en Perla Ayurveda.`);
const urlWAPaq = (v) => "https://wa.me/" + telWA(C(v.pacienteId).telefono) + "?text=" +
  encodeURIComponent(`Hola ${nombreCorto(C(v.pacienteId).nombre)}, le quedan ${restantes(v)} sesiones de su paquete "${v.nombre}" en Perla Ayurveda. Su vigencia vence el ${fCorta(v.vence)}. ¿Desea que coordinemos sus próximas citas?`);

/* ---------- UI BASE ---------- */
let pestanaActual = "hoy", filtroCitas = "proximas", periodo = "dia", filtroCli = "todos";
let textoBusqueda = "", textoSrv = "", clienteSel = null, cfgTab = "usuarios", cobrando = null;
let salaCobroId = null;     // cita de la sala que espera el método de pago
let nc = null;              // estado de la ventana "Nueva cita"
let resolverDialogo = null; // para confirmaciones

const DIAS = [[1, "Lun"], [2, "Mar"], [3, "Mié"], [4, "Jue"], [5, "Vie"], [6, "Sáb"], [0, "Dom"]];

function aviso(t) {
  const a = $("#aviso");
  a.textContent = t; a.hidden = false;
  clearTimeout(aviso.t); aviso.t = setTimeout(() => (a.hidden = true), 4000);
}

function abrirDialogo(html) {
  const m = $("#modal");
  m.innerHTML = `<div class="modal">${html}</div>`;
  m.hidden = false;
}
function cerrarModal() {
  nc = null;
  if (resolverDialogo) { const r = resolverDialogo; resolverDialogo = null; r(false); }
  $("#modal").hidden = true;
  $("#modal").innerHTML = "";
}
function confirmar(html, aceptar = "Sí, continuar") {
  return new Promise((resolver) => {
    resolverDialogo = resolver;
    abrirDialogo(`<h2>Confirmar</h2><p>${html}</p>
      <div class="cobro" style="justify-content:flex-end;margin-top:14px">
        <button type="button" class="btn secundario" data-dlg="0">Cancelar</button>
        <button type="button" class="btn" data-dlg="1">${aceptar}</button></div>`);
  });
}

/* ---------- LOGIN (FIREBASE AUTH) ---------- */
async function cargarPerfil(user) {
  const snap = await getDoc(doc(db, "usuarios", user.uid));
  if (!snap.exists() || snap.data().activo !== true) return null;
  return { ...snap.data(), id: user.uid };
}

// Crea la cuenta sin cerrar la sesión de la administradora (usa una app secundaria)
async function crearCuentaAuth(correo, clave) {
  const sec = initializeApp(firebaseConfig, "alta-" + Date.now());
  try {
    const authSec = getAuth(sec);
    const cred = await createUserWithEmailAndPassword(authSec, correo, clave);
    await signOut(authSec);
    return cred.user.uid;
  } finally {
    await deleteApp(sec);
  }
}

function mensajeAuth(err) {
  const c = (err && err.code) || "";
  if (c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found"))
    return "Correo o contraseña incorrectos.";
  if (c.includes("email-already-in-use")) return "Ya existe una cuenta con ese correo.";
  if (c.includes("weak-password")) return "La contraseña debe tener al menos 6 caracteres.";
  if (c.includes("invalid-email")) return "El correo no es válido.";
  if (c.includes("too-many-requests")) return "Demasiados intentos. Espera unos minutos.";
  if (c.includes("permission-denied")) return "No tienes permiso para hacer esto.";
  return "Ocurrió un error: " + ((err && err.message) || err);
}

// Solo se muestra el panel cuando los datos ya se descargaron de Firestore
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    mostrarLogin(avisoLogin);
    avisoLogin = "";
    return;
  }
  mostrarCargando();
  try {
    const perfil = await cargarPerfil(user);
    if (!perfil) {
      avisoLogin = "Tu cuenta no tiene acceso o está desactivada. Pide a la administradora que la active.";
      await signOut(auth);
      return;
    }
    YO = perfil;
    await cargarDatosDeLaNube();
    USUARIOS = YO.owner ? await cargarColeccion("usuarios") : [];
    if (YO.owner) { sembrarFormulario(); sembrarSeguimiento(); }
    mostrarPanel();
  } catch (err) {
    console.error(err);
    avisoLogin = "No se pudieron cargar los datos. Revisa tu conexión e inténtalo de nuevo.";
    await signOut(auth);
  }
});

function mostrarLogin(msg = "") {
  YO = null;
  $("#panel").hidden = true;
  $("#login").hidden = false;
  $("#loginTitulo").textContent = "Iniciar sesión";
  $("#loginAyuda").textContent = "Ingresa con tu correo y contraseña.";
  $("#loginError").textContent = msg;
  $("#loginBoton").disabled = false;
}

function mostrarCargando() {
  $("#login").hidden = false;
  $("#loginAyuda").textContent = "Cargando datos de la clínica…";
  $("#loginError").textContent = "";
  $("#loginBoton").disabled = true;
}

function mostrarPanel() {
  $("#login").hidden = true;
  $("#panel").hidden = false;
  $("#loginBoton").disabled = false;
  render();
  if (D.ajustes.formularioUrl) sincronizarFormulario(false);
}

$("#formLogin").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#loginError").textContent = "";
  try {
    await signInWithEmailAndPassword(auth, $("#inUsuario").value.trim(), $("#inClave").value);
    e.target.reset();
  } catch (err) {
    $("#loginError").textContent = mensajeAuth(err);
  }
});

$("#btnSalir").addEventListener("click", () => signOut(auth));

/* ---------- CLIENTES: FORMULARIO COMPARTIDO ---------- */
function formCliente(publico) {
  return `<form class="form" id="${publico ? "fCliPublico" : "fCli"}" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">
    ${publico ? '<h1>Registro de cliente</h1><p class="muted">Completa tus datos para registrarte en la clínica.</p>' : ""}
    <label>DNI<input name="dni" inputmode="numeric" maxlength="8" pattern="[0-9]{8}" required></label>
    <label>Nombres y apellidos<input name="nombre" required></label>
    <label>Sexo<select name="sexo"><option>Mujer</option><option>Hombre</option></select></label>
    <label>Fecha de nacimiento<input type="date" name="nacimiento"></label>
    <label>Teléfono (WhatsApp)<input name="telefono" type="tel" required></label>
    <label>Correo<input name="correo" type="email"></label>
    <label>Dirección<input name="direccion"></label>
    <label>Distrito<input name="distrito"></label>
    <label>¿Cómo se enteró?<select name="origen"><option>Recomendación</option><option>Facebook</option><option>Anuncio o volante</option><option>Otro</option></select></label>
    <label>Motivo de consulta<input name="motivo"></label>
    <label>¿Embarazo?<select name="embarazo"><option>No aplica</option><option>No</option><option>Sí</option></select></label>
    <label style="grid-column:1/-1">Antecedentes, alergias y medicamentos<textarea name="antecedentes"></textarea></label>
    <label class="check" style="grid-column:1/-1"><input type="checkbox" name="consentimiento" value="si">
      Acepto que mis datos personales y de salud se usen para mi atención (Ley 29733).</label>
    <p class="error msg" style="grid-column:1/-1"></p>
    <button class="btn" style="grid-column:1/-1">${publico ? "Registrarme" : "Guardar cliente"}</button>
  </form>`;
}

function validarCliente(d) {
  const dni = (d.dni || "").trim();
  if (!/^\d{8}$/.test(dni)) return "El DNI debe tener 8 dígitos.";
  if (D.clientes.some((c) => c.dni === dni)) return "Ya existe un registro con ese DNI.";
  const tel = (d.telefono || "").replace(/\D/g, "");
  if (tel.length < 9) return "El teléfono debe tener 9 dígitos.";
  if (D.clientes.some((c) => (c.telefono || "").replace(/\D/g, "") === tel)) return "Ya existe un cliente con ese teléfono.";
  if (!d.consentimiento) return "Falta el consentimiento para guardar datos de salud.";
  return null;
}

function crearCliente(d) {
  D.clientes.push({
    id: uid(), dni: d.dni.trim(), nombre: d.nombre.trim().toUpperCase(), sexo: d.sexo,
    nacimiento: d.nacimiento || "", telefono: d.telefono.trim(), correo: d.correo || "",
    direccion: d.direccion || "", distrito: d.distrito || "", origen: d.origen,
    registro: hoy(), registroHora: new Date().toTimeString().slice(0, 5), fuente: "app", consentimiento: hoy(),
    ficha: { motivo: d.motivo || "", antecedentes: d.antecedentes || "", embarazo: d.embarazo || "No aplica" },
  });
}

function clientesFiltrados() {
  const r = RANGOS();
  let l = D.clientes;
  if (filtroCli !== "todos") l = l.filter((c) => c.registro >= r[filtroCli][0] && c.registro <= r[filtroCli][1]);
  const q = norm(textoBusqueda.trim());
  if (q) l = l.filter((c) => norm(c.nombre + " " + c.dni + " " + c.telefono).includes(q));
  return l.slice().sort((a, b) => (filtroCli === "todos" ? a.nombre.localeCompare(b.nombre) : b.registro.localeCompare(a.registro)));
}

function listaClientesHTML() {
  const l = clientesFiltrados();
  if (!l.length) return '<div class="vacio">No hay clientes con ese filtro.</div>';
  return l.map((c) => {
    const n = historial(c.id).filter(esTerapia).length;
    return `<div class="fila click" data-cli="${c.id}"><div class="crece"><strong>${esc(c.nombre)}</strong>
      <div class="muted">DNI ${esc(c.dni)} · ${esc(c.telefono || "sin teléfono")} · ${esc(c.distrito)}</div></div>
      <span class="muted">Registro: ${fCorta(c.registro)}</span><span class="etq">${n} terapias</span></div>`;
  }).join("");
}

/* ---------- PAQUETES: FILAS ---------- */
function filaVenta(v) {
  const usadas = usadasDe(v), prog = programadasDe(v), libres = restantes(v), saldo = saldoDe(v);
  const pct = Math.min(100, Math.round((usadas / v.sesiones) * 100));
  return `<div class="fila">
    <div class="crece"><strong>${esc(C(v.pacienteId).nombre)}</strong>
      <div class="muted">${esc(v.nombre)} · vence ${fCorta(v.vence)} ${vencido(v) ? '<span class="etq cancelada">Vencido</span>' : ""}</div>
      <div class="barra"><span style="width:${pct}%"></span></div>
      <div class="muted">${usadas} usadas · ${prog} programadas · ${libres} libres de ${v.sesiones}</div></div>
    <div class="num-col">${saldo > 0 ? `<span class="etq llego">Debe ${soles(saldo)}</span>` : '<span class="etq atendida">Pagado</span>'}</div>
    <div class="acciones">
      ${saldo > 0 ? `<button class="btn secundario" data-abonar="${v.id}">Abonar</button>` : ""}
      <button class="btn secundario" data-extender="${v.id}">+30 días</button>
      <button class="btn peligro" data-delventa="${v.id}">Eliminar</button>
    </div></div>`;
}

/* ---------- CITAS: FILAS ---------- */
function filaCita(c, conFecha) {
  return `<div class="fila">
    <div class="hora">${esc(hora12(c.hora))}</div>
    <div class="crece"><strong>${esc(C(c.pacienteId).nombre)}</strong>
      <div class="muted">${conFecha ? fDia(c.fecha) + " · " : ""}${esc(S(c.servicioId).nombre)} · ${durSrv(c.servicioId)} min · ${esc(c.recurso || "")} · ${c.ventaId ? "Paquete" : soles(c.precio)}</div></div>
    <span class="etq ${c.estado}">${ESTADO[c.estado] || c.estado}</span>
    <select data-st="${c.id}"><option value="">Cambiar estado…</option>
      ${Object.entries(ESTADO).map(([k, t]) => `<option value="${k}">${t}</option>`).join("")}</select>
    ${puede("citas") ? `<button class="btn peligro" data-delcita="${c.id}">Eliminar</button>` : ""}</div>`;
}

function filaHoy(c, esHoy) {
  let acc;
  if (!esHoy) {
    const ok = telWA(C(c.pacienteId).telefono);
    acc = ok ? `<a class="gran wa ${c.recordado ? "hecho" : ""}" href="${urlWA(c)}" target="_blank" rel="noopener" data-recordado="${c.id}">${c.recordado ? "✓ Avisado" : "Recordar"}</a>`
      : '<span class="muted">Sin teléfono válido</span>';
  } else if (cobrando === c.id) {
    acc = `<div class="cobro"><b>¿Cómo pagó ${soles(c.precio)}?</b>
      <button class="gran pago" data-pago="Efectivo" data-id="${c.id}">Efectivo</button>
      <button class="gran pago" data-pago="Yape" data-id="${c.id}">Yape</button>
      <button class="gran sec" data-cancobro="1">Volver</button></div>`;
  } else if (["atendida", "novino", "cancelada", "reprogramada"].includes(c.estado)) {
    acc = `<span class="etq ${c.estado}">${ESTADO[c.estado]}${c.pago ? " · " + c.pago : ""}</span>
      ${c.estado === "atendida" && c.ventaId ? `<button class="btn" data-siguiente="${c.id}">Agendar siguiente</button>` : ""}
      <button class="btn secundario" data-acc="pendiente" data-id="${c.id}">Corregir</button>`;
  } else {
    acc = `${c.estado === "llego" ? '<span class="etq llego">Llegó</span>' : `<button class="gran sec" data-acc="llego" data-id="${c.id}">Llegó</button>`}
      <button class="gran ok" data-acc="atendida" data-id="${c.id}">Atendido</button>
      <button class="gran no" data-acc="novino" data-id="${c.id}">No vino</button>
      <button class="btn secundario" data-reprog="${c.id}">Reprogramar</button>
      <button class="btn peligro" data-acc="cancelada" data-id="${c.id}">Cancelar</button>`;
  }
  return `<div class="cita-hoy ${c.estado}"><div class="hora">${hora12(c.hora)}</div>
    <div class="crece"><strong>${esc(C(c.pacienteId).nombre)}</strong>
    <div class="muted">${esc(S(c.servicioId).nombre)} · ${durSrv(c.servicioId)} min · ${esc(c.recurso || "")}${c.ventaId ? " · Paquete" : ""}</div></div>
    <div class="acciones">${acc}</div></div>`;
}

/* ---------- SERVICIOS ---------- */
function listaSrvHTML() {
  const q = norm(textoSrv.trim());
  const l = srvFrecuentes().filter((s) => !q || norm(s.nombre).includes(q));
  if (!l.length) return '<div class="vacio">No hay servicios con ese nombre.</div>';
  return l.map((s) => `<div class="fila"><div class="crece"><strong>${esc(s.nombre)}</strong>
    <div class="muted">${durSrv(s.id)} min</div></div>
    <span class="monto">${soles(s.precio)}</span>
    <button class="btn peligro" data-delsrv="${s.id}">Eliminar</button></div>`).join("");
}

/* ---------- SALA EN VIVO ---------- */
const salaRango = () => ({ ini: aMin(D.ajustes.inicio), fin: aMin(D.ajustes.fin) });
const horaAhora = () => new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

// Actualiza el reloj y la línea roja sin redibujar toda la pantalla
function latirSala() {
  const el = $("#salaReloj");
  if (!el) return;
  el.textContent = horaAhora();
  const l = $("#salaLinea"), r = salaRango(), m = minutosAhora();
  if (l) {
    l.hidden = m < r.ini || m > r.fin;
    l.style.top = ((m - r.ini) / (r.fin - r.ini)) * 100 + "%";
  }
}

function abrirSalaDetalle(id) {
  const c = D.citas.find((x) => x.id === id);
  if (!c) return;
  const cobroPend = !c.ventaId && +c.precio > 0;
  const esperaPago = salaCobroId === c.id;
  abrirDialogo(`<div class="modal-top"><h2>${esc(C(c.pacienteId).nombre)}</h2>
      <button type="button" class="btn secundario" data-cerrar="1">Cerrar</button></div>
    <p class="muted">${hora12(c.hora)} · ${durSrv(c.servicioId)} min · ${esc(S(c.servicioId).nombre)} · ${c.ventaId ? "Paquete" : soles(c.precio)}</p>
    <p><span class="etq ${c.estado}">${ESTADO[c.estado]}${c.pago ? " · " + esc(c.pago) : ""}</span></p>
    <h3>Sala</h3>
    <select data-salasel="${c.id}">${D.ajustes.recursos.map((r) => `<option ${r === c.recurso ? "selected" : ""}>${esc(r)}</option>`).join("")}</select>
    <h3>Estado</h3>
    ${esperaPago ? `<p><strong>¿Cómo pagó ${soles(c.precio)}?</strong></p>
      <div class="opciones">
        <button class="gran pago" data-spago="Efectivo" data-id="${c.id}">Efectivo</button>
        <button class="gran pago" data-spago="Yape" data-id="${c.id}">Yape</button>
      </div>`
      : `<div class="opciones">
        <button class="gran sec" data-sacc="llego" data-id="${c.id}">Llegó</button>
        <button class="gran ok" data-sacc="atendida" data-id="${c.id}" data-cobra="${cobroPend ? 1 : 0}">Atendido</button>
        <button class="gran no" data-sacc="novino" data-id="${c.id}">No vino</button>
        <button class="btn secundario" data-sacc="pendiente" data-id="${c.id}">Volver a pendiente</button>
      </div>`}`);
}



/* ---------- PANTALLAS ---------- */
const vistas = {
  inicio() {
    const h = hoy(), r = RANGOS();
    const citasHoy = citasDe(h);
    const pend = citasHoy.filter((c) => c.estado === "pendiente").length;
    const paqMes = D.ventas.filter((v) => v.fecha >= r.mes[0] && v.fecha <= r.mes[1]).length;
    const nuevosMes = D.clientes.filter((c) => c.registro >= r.mes[0] && c.registro <= r.mes[1]).length;
    const alerta = ventasActivas().filter((v) => diasEntre(v.vence) <= 15 || restantes(v) <= 2);
    const cumples = cumpleanios();
    return `<div class="tarjetas">
      <div class="tarjeta" data-tab="citas"><span class="muted">Citas de hoy</span><div class="cifra">${citasHoy.length}</div><small>${pend} pendientes</small></div>
      <div class="tarjeta" data-tab="paquetes"><span class="muted">Paquetes vendidos este mes</span><div class="cifra">${paqMes}</div><small>${ventasActivas().length} activos</small></div>
      <div class="tarjeta" data-tab="ganancias"><span class="muted">Ganancias de hoy</span><div class="cifra">${soles(total(movimientos(h, h)))}</div><small>Ver semana y mes</small></div>
      <div class="tarjeta" data-tab="clientes"><span class="muted">Clientes</span><div class="cifra">${D.clientes.length}</div><small>${nuevosMes} nuevos este mes</small></div>
    </div>
    <div class="dos">
      <section class="caja"><h3>Agenda de hoy</h3>${citasHoy.length ? citasHoy.map((c) => filaCita(c, false)).join("") : '<div class="vacio">No hay citas para hoy.</div>'}</section>
      <section class="caja"><h3>Cumpleaños próximos</h3>${cumples.length ? cumples.slice(0, 12).map(({ c, k }) => `<div class="fila"><div class="crece"><strong>${esc(c.nombre)}</strong>
        <div class="muted">Cumple ${k.edad} años · ${k.fecha.toLocaleDateString("es-PE", { day: "numeric", month: "long" })}</div></div>
        <span class="cumple">${k.dias === 0 ? "¡Hoy!" : k.dias === 1 ? "Mañana" : "En " + k.dias + " días"}</span></div>`).join("")
        : '<div class="vacio">Nadie cumple años en los próximos 30 días.</div>'}</section>
    </div>
    <section class="caja"><h3>Paquetes por terminar o por vencer</h3>${alerta.length ? alerta.map((v) => `<div class="fila">
      <div class="crece"><strong>${esc(C(v.pacienteId).nombre)}</strong>
      <div class="muted">${esc(v.nombre)} · ${restantes(v)} sesiones libres · vence ${fCorta(v.vence)}</div></div>
      ${telWA(C(v.pacienteId).telefono) ? `<a class="gran wa" href="${urlWAPaq(v)}" target="_blank" rel="noopener">Avisar</a>` : ""}</div>`).join("")
      : '<div class="vacio">Ningún paquete está por terminar.</div>'}</section>`;
  },

  citas() {
    const h = hoy();
    let lista = D.citas.filter((c) => filtroCitas === "hoy" ? c.fecha === h : filtroCitas === "proximas" ? c.fecha >= h : true)
      .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
    if (filtroCitas === "todas") lista = lista.reverse();
    const listo = D.clientes.length && D.servicios.length;
    return `<h2>Citas</h2>
    ${listo ? '<button class="btn gran" data-nueva="1">+ Nueva cita</button>' : '<div class="caja vacio">Primero registra al menos un cliente y un servicio.</div>'}
    <div class="seccion">
      <div style="max-width:220px;margin-bottom:10px"><select id="filtro">
        ${[["proximas", "Próximas"], ["hoy", "Solo hoy"], ["todas", "Todas"]].map(([v, t]) => `<option value="${v}" ${filtroCitas === v ? "selected" : ""}>${t}</option>`).join("")}</select></div>
      <div class="caja">${lista.length ? lista.map((c) => filaCita(c, true)).join("") : '<div class="vacio">No hay citas en esta vista.</div>'}</div>
    </div>`;
  },

  clientes() {
    if (clienteSel) return detalleCliente(clienteSel);
    const r = RANGOS();
    const cuenta = (k) => D.clientes.filter((c) => c.registro >= r[k][0] && c.registro <= r[k][1]).length;
    const chip = (k, t, n) => `<button class="chip ${filtroCli === k ? "sel" : ""}" data-fil="${k}">${t} (${n})</button>`;
    const sinVincular = {};
    D.atenciones.filter((a) => !a.pacienteId && a.nombre).forEach((a) => { sinVincular[a.nombre] = (sinVincular[a.nombre] || 0) + 1; });
    const nSin = Object.keys(sinVincular).length;
    return `<h2>Clientes</h2>
    <div class="chips">${chip("todos", "Todos", D.clientes.length)}${chip("semana", "Nuevos esta semana", cuenta("semana"))}${chip("mes", "Nuevos este mes", cuenta("mes"))}${chip("anio", "Nuevos este año", cuenta("anio"))}</div>
    <input class="buscador" id="buscar" placeholder="Buscar por nombre, DNI o teléfono" value="${esc(textoBusqueda)}">
    <div class="caja" id="lista">${listaClientesHTML()}</div>
    <details class="caja"><summary>Registrar cliente nuevo</summary>${formCliente(false)}</details>
    ${nSin ? `<details class="caja"><summary>${nSin} personas atendidas sin registro de cliente</summary>
      <p class="muted">Aparecen en tus atenciones pero no en el formulario. Su dinero sí cuenta en Ganancias.</p>
      ${Object.entries(sinVincular).sort().map(([n, k]) => `<div class="fila"><div class="crece">${esc(n)}</div><span class="muted">${k} atenciones</span></div>`).join("")}</details>` : ""}`;
  },

  servicios() {
    return `<h2>Servicios</h2>
    <form class="form" id="fSrv">
      <label>Nombre<input name="nombre" required></label>
      <label>Precio (S/)<input name="precio" type="number" min="0" step="0.5" required></label>
      <label>Duración (min)<input name="duracion" type="number" min="5" step="5" value="${D.ajustes.duracionDefault}" required></label>
      <button class="btn">Guardar servicio</button>
    </form>
    <input class="buscador" id="buscarSrv" placeholder="Buscar servicio…" value="${esc(textoSrv)}" autocomplete="off">
    <div class="caja" id="listaSrv">${listaSrvHTML()}</div>`;
  },

  paquetes() {
    const listo = D.clientes.length && D.paquetes.length;
    const ventas = D.ventas.slice().reverse();
    return `<h2>Paquetes</h2>
    <h3>Vender paquete</h3>
    ${listo ? `<form class="form" id="fVenta">
      <label>Cliente<select name="pacienteId" required>${clientesOrdenados().map((c) => `<option value="${c.id}" ${c.id === preVenta ? "selected" : ""}>${esc(c.nombre)}</option>`).join("")}</select></label>
      <label>Paquete<select name="paqueteId" id="selPaq" required>${D.paquetes.map((q) => `<option value="${q.id}" data-p="${q.precio}">${esc(q.nombre)} · ${q.sesiones} ses.</option>`).join("")}</select></label>
      <label>Precio total (S/)<input type="number" name="precio" id="inPaqPrecio" min="0" step="0.5" value="${D.paquetes[0].precio}" required></label>
      <label>Pago inicial (S/)<input type="number" name="pago" min="0" step="0.5" value="0"></label>
      <label>Método<select name="metodo"><option>Efectivo</option><option>Yape</option><option>Plin</option><option>Transferencia</option><option>Tarjeta</option></select></label>
      <label>Fecha<input type="date" name="fecha" value="${hoy()}" required></label>
      <button class="btn">Vender paquete</button>
    </form>` : '<div class="caja vacio">Necesitas clientes y paquetes registrados.</div>'}
    <div class="caja">${ventas.length ? ventas.map(filaVenta).join("") : '<div class="vacio">Aún no hay paquetes vendidos.</div>'}</div>

    <div class="seccion"><h2>Catálogo de paquetes</h2>
    <details class="caja"><summary>+ Crear paquete</summary>
      <form class="form" id="fPaq">
        <label>Nombre<input name="nombre" required></label>
        <label>Sesiones<input name="sesiones" type="number" min="1" required></label>
        <label>Precio (S/)<input name="precio" type="number" min="0" step="0.5" required></label>
        <button class="btn">Crear paquete</button>
      </form></details>
    <div class="caja">${D.paquetes.map((q) => `<div class="fila"><div class="crece"><strong>${esc(q.nombre)}</strong>
      <div class="muted">${q.sesiones} sesiones</div></div><span class="monto">${soles(q.precio)}</span>
      <button class="btn peligro" data-delpaq="${q.id}">Eliminar</button></div>`).join("") || '<div class="vacio">Aún no hay paquetes.</div>'}</div></div>`;
  },

  ganancias() {
    const r = RANGOS(), nombres = { dia: "Hoy", semana: "Esta semana", mes: "Este mes", anio: "Este año" };
    const mov = (k) => movimientos(r[k][0], r[k][1]);
    const porCobrar = D.ventas.reduce((s, v) => s + saldoDe(v), 0);
    const d = mov(periodo);
    return `<div class="tarjetas">${["dia", "semana", "mes", "anio"].map((k) => `<div class="tarjeta ${periodo === k ? "sel" : ""}" data-per="${k}">
      <span class="muted">${nombres[k]}</span><div class="cifra">${soles(total(mov(k)))}</div></div>`).join("")}</div>
    <p class="muted">Por cobrar en paquetes: <strong>${soles(porCobrar)}</strong></p>
    <section class="caja"><h3>Detalle: ${nombres[periodo].toLowerCase()}</h3>
      ${d.length ? `<div class="scroll"><table><tbody>${d.map((x) => `<tr><td>${fDia(x.fecha)}</td><td>${esc(x.texto)}</td><td class="num"><strong>${soles(x.monto)}</strong></td></tr>`).join("")}</tbody></table></div>`
        : '<div class="vacio">Sin ingresos en este periodo.</div>'}</section>`;
  },

  configuracion() {
    if (!YO || !YO.owner) return vistas.sinacceso();
    const tab = (k, t) => `<button class="chip ${cfgTab === k ? "sel" : ""}" data-cfg="${k}">${t}</button>`;
    const cuerpo = cfgTab === "usuarios" ? usuariosHTML() : cfgTab === "ajustes" ? ajustesHTML() : respaldoHTML();
    return `<h2>Configuración</h2>
    <div class="chips">${tab("usuarios", "Usuarios y accesos")}${tab("ajustes", "Clínica y horarios")}${tab("respaldo", "Respaldo")}</div>
    ${cuerpo}`;
  },

  sinacceso() {
    return `<div class="caja vacio">No tienes acceso a ninguna sección. Pide a la administradora que te dé permisos.</div>`;
  },
};
vistas.sala = function () {
  const h = hoy(), recs = D.ajustes.recursos, r = salaRango(), total = r.fin - r.ini;
  const pos = (m) => ((m - r.ini) / total) * 100;
  const ahora = minutosAhora();
  const citas = citasDe(h);
  const colDe = (c) => (recs.includes(c.recurso) ? c.recurso : recs[0]);
  const activas = citas.filter((c) => ["pendiente", "llego"].includes(c.estado));
  const enCurso = activas.filter((c) => aMin(c.hora) <= ahora && ahora < aMin(c.hora) + durSrv(c.servicioId));
  const prox = activas.find((c) => aMin(c.hora) > ahora);
  const horas = [];
  for (let m = r.ini; m <= r.fin; m += 60) horas.push(m);
  const fechaTxt = new Date().toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" });

  const bloque = (c) => {
    const dur = durSrv(c.servicioId);
    return `<button type="button" class="blq ${c.estado}" data-sdet="${c.id}" style="top:${pos(aMin(c.hora))}%;height:${(dur / total) * 100}%">
      <strong>${esc(C(c.pacienteId).nombre)}</strong>
      <span>${hora12(c.hora)} · ${dur} min</span>
      ${dur >= 60 ? `<span>${esc(S(c.servicioId).nombre)}${c.ventaId ? " · Paquete" : ""}</span><em>${ESTADO[c.estado]}</em>` : ""}
    </button>`;
  };

  const txtProx = prox
    ? `<strong>Siguiente: ${esc(C(prox.pacienteId).nombre)}</strong> · ${hora12(prox.hora)} · ${esc(colDe(prox))}
       <small>${aMin(prox.hora) - ahora > 0 ? "En " + (aMin(prox.hora) - ahora) + " minutos" : "Ya es su hora"}</small>`
    : `<strong>No hay más citas pendientes hoy</strong>`;
  const txtCurso = enCurso.length
    ? enCurso.map((c) => `${esc(C(c.pacienteId).nombre)} (${esc(colDe(c))})`).join(" · ")
    : "Ninguna";

  return `<div class="sala">
    <div class="sala-top">
      <div><h2>${esc(D.ajustes.clinica)} · Agenda de hoy</h2>
        <p class="muted" style="text-transform:capitalize">${fechaTxt}</p></div>
      <div class="sala-reloj" id="salaReloj">${horaAhora()}</div>
      <button type="button" class="btn secundario" data-fullscreen="1">Pantalla completa</button>
    </div>
    <div class="sala-prox">${txtProx}<small>En curso: ${txtCurso}</small></div>
    <div class="sala-wrap" style="--n:${recs.length}">
      <div class="sala-cab"><div></div>${recs.map((x) => `<div>${esc(x)}</div>`).join("")}</div>
      <div class="sala-cuerpo">
        <div class="sala-horas">${horas.map((m) => `<span style="top:${pos(m)}%">${hora12(aHora(m))}</span>`).join("")}</div>
        ${recs.map((x) => `<div class="sala-col">
          ${horas.map((m) => `<i class="hl" style="top:${pos(m)}%"></i>`).join("")}
          ${citas.filter((c) => colDe(c) === x).map(bloque).join("")}
        </div>`).join("")}
        <div class="ahora-linea" id="salaLinea" hidden></div>
      </div>
    </div>
    <div class="sala-leyenda">
      <span><i style="background:#f3eefc"></i>Pendiente</span>
      <span><i style="background:#fff4dc"></i>Llegó</span>
      <span><i style="background:#e6f6ee"></i>Atendido</span>
      <span><i style="background:#fbe7f0"></i>No vino</span>
      <span>Toca una cita para cambiar su estado o de sala</span>
    </div>
  </div>`;
};

function detalleCliente(id) {
  const c = C(id), h = historial(id), f = c.ficha || {};
  const ter = h.filter(esTerapia).length;
  const gastado = h.reduce((s, x) => s + (+x.total || 0), 0);
  const ult = h.find(esTerapia);
  const vs = D.ventas.filter((v) => v.pacienteId === id);
  const dato = (t, v) => `<div><span>${t}</span>${esc(v || "—")}</div>`;
  return `<button class="btn secundario" data-volver="1" style="margin-bottom:14px">← Volver a clientes</button>
  <h2>${esc(c.nombre)}</h2>
  <div class="tarjetas">
    <div class="tarjeta"><span class="muted">Terapias realizadas</span><div class="cifra">${ter}</div></div>
    <div class="tarjeta"><span class="muted">Paquetes comprados</span><div class="cifra">${vs.length}</div></div>
    <div class="tarjeta"><span class="muted">Total pagado</span><div class="cifra">${soles(gastado)}</div></div>
    <div class="tarjeta"><span class="muted">Última terapia</span><div class="cifra" style="font-size:20px">${ult ? fCorta(ult.fecha) : "—"}</div></div>
  </div>
  <section class="caja"><h3>Datos del cliente</h3><div class="datos">
    ${dato("DNI", c.dni)}${dato("Sexo", c.sexo)}${dato("Fecha de nacimiento", fCorta(c.nacimiento))}${dato("Teléfono", c.telefono)}
    ${dato("Correo", c.correo)}${dato("Dirección", c.direccion)}${dato("Distrito", c.distrito)}
    ${dato("Cómo se enteró", c.origen)}${dato("Registrado el", fCorta(c.registro))}</div></section>
  <section class="caja"><h3>Ficha clínica</h3><div class="datos">
    ${dato("Motivo de consulta", f.motivo)}${dato("Antecedentes, alergias y medicamentos", f.antecedentes)}
    ${dato("Embarazo", f.embarazo)}${dato("Consentimiento firmado", c.consentimiento ? fCorta(c.consentimiento) : "")}</div></section>
  <section class="caja"><h3>Paquetes</h3>${vs.length ? vs.map(filaVenta).join("") : '<div class="vacio">Este cliente no tiene paquetes.</div>'}</section>
  <section class="caja"><h3>Historial de atenciones</h3>
    ${h.length ? `<div class="scroll"><table><thead><tr><th>Fecha</th><th>Servicio</th><th>Tipo</th><th>Detalle</th><th class="num">Monto</th></tr></thead><tbody>
    ${h.map((x) => `<tr><td>${fCorta(x.fecha)}</td><td>${esc(x.servicio)}</td><td><span class="etq ${x.tipo}">${ETQ[x.tipo] || x.tipo}</span></td>
      <td>${esc(x.obs)}${x.pago ? " " + esc(x.pago) : ""}</td><td class="num">${x.total ? soles(x.total) : "—"}</td></tr>`).join("")}
    </tbody></table></div>` : '<div class="vacio">Este cliente aún no tiene atenciones registradas.</div>'}</section>`;
}

/* ---------- CONFIGURACIÓN: USUARIOS ---------- */
function usuariosHTML() {
  const checks = (sel = []) => `<div class="perm-grid">${SECCIONES.map(([k, t]) =>
    `<label class="check"><input type="checkbox" name="sec" value="${k}" ${sel.includes(k) ? "checked" : ""}> ${t}</label>`).join("")}</div>`;
  const tarjeta = (u) => `<div class="caja">
    <div class="fila"><div class="crece"><strong>${esc(u.nombre)}</strong> <span class="muted">${esc(u.usuario)}</span></div>
      <span class="etq ${u.activo ? "atendida" : "cancelada"}">${u.owner ? "Administradora" : u.activo ? "Activo" : "Desactivado"}</span></div>
    ${u.owner ? '<p class="muted">Tiene acceso a todas las secciones y a esta configuración.</p>' : `
    <form class="form" data-permisos="${u.id}" style="grid-template-columns:1fr">
      <p class="muted">Secciones que puede ver:</p>
      ${checks(u.permisos)}
      <div class="cobro">
        <button class="btn">Guardar accesos</button>
        <button type="button" class="btn secundario" data-toggle-user="${u.id}">${u.activo ? "Desactivar" : "Activar"}</button>
        <button type="button" class="btn secundario" data-reset="${u.id}">Enviar enlace para cambiar contraseña</button>
        <button type="button" class="btn peligro" data-del-user="${u.id}">Quitar acceso</button>
      </div>
    </form>`}
  </div>`;
  return `<div class="seccion"><h3>Usuarios</h3>${USUARIOS.map(tarjeta).join("")}</div>
  <details class="caja"><summary>+ Crear usuario</summary>
    <p class="muted">Crea la cuenta con un correo y una contraseña temporal. Luego la persona puede cambiarla desde "Mi contraseña".</p>
    <form class="form" id="fUsuario" style="grid-template-columns:1fr 1fr">
      <label>Nombre<input name="nombre" required></label>
      <label>Correo electrónico<input name="usuario" type="email" required autocomplete="off"></label>
      <label>Contraseña temporal (mínimo 6)<input type="password" name="clave" minlength="6" required autocomplete="new-password"></label>
      <div style="grid-column:1/-1"><p class="muted">Elige qué secciones puede ver:</p>${checks(["hoy", "citas", "clientes"])}</div>
      <div style="grid-column:1/-1"><button class="btn">Crear usuario</button></div>
    </form></details>`;
}

/* ---------- CONFIGURACIÓN: AJUSTES ---------- */
function ajustesHTML() {
  const a = D.ajustes;
  return `<form class="form" id="fAjustes" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
    <label>Nombre de la clínica<input name="clinica" value="${esc(a.clinica)}" required></label>
    <label>Hora de inicio<input type="time" name="inicio" value="${a.inicio}" required></label>
    <label>Hora de cierre<input type="time" name="fin" value="${a.fin}" required></label>
    <label>Intervalo entre horas<select name="paso">${[15, 30, 60].map((n) => `<option value="${n}" ${a.paso == n ? "selected" : ""}>${n} minutos</option>`).join("")}</select></label>
    <label>Duración por defecto (min)<input type="number" name="duracionDefault" min="5" step="5" value="${a.duracionDefault}" required></label>
    <label>Vigencia de paquetes (días)<input type="number" name="vigenciaDias" min="1" value="${a.vigenciaDias}" required></label>
    <label>Salas o camillas (separadas por coma)<input name="recursos" value="${esc(a.recursos.join(", "))}" required></label>
    <label style="grid-column:1/-1">Enlace del formulario (hoja de Google publicada como CSV)<input name="formularioUrl" type="url" placeholder="https://docs.google.com/spreadsheets/d/e/…/pub?output=csv" value="${esc(a.formularioUrl || "")}"></label>
    <label>Revisar el formulario cada<select name="formularioMin">${[2, 5, 10, 30].map((n) => `<option value="${n}" ${(+a.formularioMin || 5) === n ? "selected" : ""}>${n} minutos</option>`).join("")}</select></label>
    <details class="caja" style="grid-column:1/-1"><summary>¿Cómo obtengo el enlace?</summary>
      <ol class="muted"><li>Abre la hoja de respuestas del formulario en Google Sheets.</li>
      <li>Archivo → Compartir → <strong>Publicar en la web</strong>.</li>
      <li>Elige la pestaña de respuestas (no “Todo el documento”) y el formato <strong>Valores separados por comas (.csv)</strong>.</li>
      <li>Pulsa Publicar, copia el enlace y pégalo aquí.</li></ol>
      <p class="error">Ojo: quien tenga ese enlace puede leer la hoja (DNI, teléfonos, direcciones). No lo compartas.</p></details>
    <label class="check"><input type="checkbox" name="novinoConsume" value="si" ${a.novinoConsume ? "checked" : ""}> Si el paciente no vino, se descuenta la sesión del paquete</label>
    <div style="grid-column:1/-1"><button class="btn">Guardar ajustes</button></div>
  </form>`;
}

/* ---------- CONFIGURACIÓN: RESPALDO ---------- */
function respaldoHTML() {
  return `<div class="caja"><h3>Descargar respaldo</h3>
    <p class="muted">Guarda clientes, servicios, paquetes, citas y ajustes en un archivo. No incluye contraseñas.</p>
    <button type="button" class="btn" data-exportar="1">Descargar respaldo (.json)</button></div>
  <div class="caja"><h3>Restaurar respaldo</h3>
    <p class="muted">Reemplaza TODOS los datos actuales por los del archivo.</p>
    <input type="file" id="impFile" accept="application/json"></div>`;
}

function exportar() {
  const blob = new Blob([JSON.stringify({ version: 2, fecha: new Date().toISOString(), datos: D }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "respaldo-fisio-" + hoy() + ".json";
  a.click();
}

async function importar(file) {
  let datos;
  try {
    const j = JSON.parse(await file.text());
    datos = j.datos || j;
    if (!Array.isArray(datos.clientes)) throw new Error();
  } catch {
    alert("El archivo no es un respaldo válido.");
    return;
  }
  if (!(await confirmar("Se reemplazarán <strong>todos</strong> los datos actuales. ¿Continuar?", "Sí, restaurar"))) return;
  D = datos;
  normalizar();
  guardar();
  aviso("Respaldo restaurado");
  render();
}

/* ---------- NUEVA CITA ---------- */
const horasDelDia = () => {
  const out = [], fin = aMin(D.ajustes.fin);
  for (let m = aMin(D.ajustes.inicio); m < fin; m += D.ajustes.paso) out.push(aHora(m));
  return out;
};

// ¿Se cruza con otra cita? Solo choca si ya no quedan salas libres en ese horario
function seSolapan(c, a, b) {
  return aMin(c.hora) < b && a < aMin(c.hora) + durSrv(c.servicioId);
}
function choca(fecha, hora, dur, excluir) {
  const a = aMin(hora), b = a + dur;
  const ocupadas = D.citas.filter((c) => c.id !== excluir && c.fecha === fecha && ocupaHorario(c) && seSolapan(c, a, b));
  return ocupadas.length >= D.ajustes.recursos.length;
}
// Primera sala libre en ese horario
function recursoLibre(fecha, hora, dur, excluir) {
  const a = aMin(hora), b = a + dur;
  const usadas = D.citas.filter((c) => c.id !== excluir && c.fecha === fecha && ocupaHorario(c) && seSolapan(c, a, b))
    .map((c) => c.recurso);
  return D.ajustes.recursos.find((r) => !usadas.includes(r)) || D.ajustes.recursos[0];
}

function abrirNueva(pre = {}) {
  const top = srvFrecuentes()[0];
  nc = { cli: "", q: "", qs: "", srv: top ? top.id : "", precio: top ? top.precio : 0, ventaId: "",
    bloque: false, dias: [1, 3, 5], fecha: hoy(), hora: "", reprogramaDe: "", ...pre };
  if (!("precio" in pre)) nc.precio = S(nc.srv).precio || 0;
  if (nc.cli && !("ventaId" in pre)) nc.ventaId = ventasActivas(nc.cli)[0]?.id || "";
  dibujarModal();
}

function resCli() {
  const q = norm(nc.q.trim());
  if (q.length < 2) return '<div class="vacio">Escribe el nombre, DNI o teléfono del cliente.</div>';
  const l = D.clientes.filter((c) => norm(c.nombre + " " + c.dni + " " + c.telefono).includes(q)).slice(0, 8);
  if (l.length) return l.map((c) => `<button type="button" class="opc lista" data-nccli="${c.id}"><strong>${esc(c.nombre)}</strong> <span class="muted">DNI ${esc(c.dni)}</span></button>`).join("");
  return `<div class="vacio">No está registrado. ${puede("clientes") ? '<button type="button" class="btn secundario" data-irclientes="1">Registrar cliente nuevo</button>' : ""}</div>`;
}

function resSrv() {
  const q = norm(nc.qs.trim());
  const l = q ? srvFrecuentes().filter((s) => norm(s.nombre).includes(q)) : srvFrecuentes().slice(0, 4);
  if (!l.length) return '<div class="vacio">No hay servicios con ese nombre.</div>';
  return `<div class="opciones">${l.map((s) => `<button type="button" class="opc ${nc.srv === s.id ? "sel" : ""}" data-ncsrv="${s.id}">${esc(s.nombre)} <small>${soles(s.precio)} · ${durSrv(s.id)} min</small></button>`).join("")}</div>`;
}

function planBloque(v) {
  const fechas = [], saltadas = [], dur = durSrv(nc.srv);
  const d = new Date(nc.fecha + "T00:00");
  for (let i = 0; i < 365 && fechas.length < restantes(v) && nc.dias.length; i++, d.setDate(d.getDate() + 1)) {
    if (!nc.dias.includes(d.getDay())) continue;
    (choca(aISO(d), nc.hora, dur, nc.reprogramaDe) ? saltadas : fechas).push(aISO(d));
  }
  return { fechas, saltadas };
}

function dibujarModal() {
  const m = $("#modal");
  if (!nc) return cerrarModal();
  const sc = m.firstElementChild ? m.firstElementChild.scrollTop : 0;
  const vs = nc.cli ? ventasActivas(nc.cli) : [];
  const v = vs.find((x) => x.id === nc.ventaId);
  const srv = S(nc.srv), dur = durSrv(nc.srv);
  const plan = v && nc.bloque && nc.hora ? planBloque(v) : null;
  const conflicto = !nc.bloque && nc.hora && choca(nc.fecha, nc.hora, dur, nc.reprogramaDe);
  const listo = nc.cli && nc.srv && nc.hora && !conflicto && (!nc.bloque || (plan && plan.fechas.length));
  const chip = (attr, val, txt, sel, cls = "") => `<button type="button" class="opc ${sel ? "sel" : ""} ${cls}" ${attr}="${val}">${txt}</button>`;

  m.hidden = false;
  m.innerHTML = `<div class="modal">
    <div class="modal-top"><h2>${nc.reprogramaDe ? "Reprogramar cita" : "Nueva cita"}</h2>
      <button type="button" class="btn secundario" data-cerrar="1">Cerrar</button></div>

    <h3>1. Cliente</h3>
    ${nc.cli ? `<div class="fila"><div class="crece"><strong>${esc(C(nc.cli).nombre)}</strong></div>
        ${nc.reprogramaDe ? "" : '<button type="button" class="btn secundario" data-nccambiar="1">Cambiar</button>'}</div>`
      : `<input id="ncBusca" class="buscador" placeholder="Buscar por nombre, DNI o teléfono" value="${esc(nc.q)}" autocomplete="off">
         <div id="ncRes">${resCli()}</div>`}

    <h3>2. Servicio</h3>
    <input id="ncBuscaSrv" class="buscador" placeholder="Buscar servicio (ej. masaje, terapia…)" value="${esc(nc.qs)}" autocomplete="off">
    <div id="ncResSrv">${resSrv()}</div>
    <p class="muted">Elegido: <strong>${esc(srv.nombre)}</strong> · ${durSrv(nc.srv)} min</p>

    ${v ? "" : `<label style="max-width:180px;margin-top:8px">Costo (S/)<input id="ncPrecio" type="number" min="0" step="0.5" value="${nc.precio}"></label>`}

    ${vs.length ? `<h3>3. Cobro</h3>
      <div class="opciones">${chip("data-nccobro", "", "Pago individual", !nc.ventaId)}
        ${vs.map((x) => chip("data-nccobro", x.id, `Paquete ${esc(x.nombre)} (${restantes(x)} libres)`, nc.ventaId === x.id)).join("")}</div>
      ${v ? `<label class="check"><input type="checkbox" id="ncBloque" ${nc.bloque ? "checked" : ""}> Agendar todas las sesiones libres de una vez</label>` : ""}` : ""}

    <h3>${nc.bloque ? "Desde el día" : "Día"} <span class="muted">${fDia(nc.fecha)}</span></h3>
    <div class="opciones">${chip("data-ncfecha", "hoy", "Hoy", nc.fecha === hoy())}${chip("data-ncfecha", "man", "Mañana", nc.fecha === manana())}
      <input type="date" id="ncFecha" value="${nc.fecha}" style="width:auto"></div>
    ${nc.bloque ? `<h3>Días de la semana</h3><div class="opciones">${DIAS.map(([n, t]) => chip("data-ncdia", n, t, nc.dias.includes(n))).join("")}</div>` : ""}

    <h3>Hora <span class="muted">· dura ${dur} min</span></h3>
    <div class="opciones horas">${horasDelDia().map((h) => {
      const ocup = !nc.bloque && choca(nc.fecha, h, dur, nc.reprogramaDe);
      return `<button type="button" class="opc ${nc.hora === h ? "sel" : ""} ${ocup ? "ocup" : ""}" data-nchora="${h}" ${ocup ? "disabled" : ""}>${hora12(h)}</button>`;
    }).join("")}</div>
    ${!nc.bloque ? '<p class="muted">Las horas deshabilitadas ya no tienen salas libres.</p>' : ""}
    ${conflicto ? '<p class="error">Ese horario ya no tiene salas libres. Elige otra hora.</p>' : ""}

    ${plan ? `<div class="caja resumen"><strong>Se crearán ${plan.fechas.length} citas:</strong> ${plan.fechas.map(fDia).join(", ")}
      ${plan.saltadas.length ? `<p class="muted">Se saltan ${plan.saltadas.map(fDia).join(", ")} porque no hay salas libres a esa hora.</p>` : ""}</div>` : ""}

    <button type="button" class="btn gran grande" data-ncok="1" ${listo ? "" : "disabled"}>
      ${nc.reprogramaDe ? "Guardar nueva fecha" : plan ? `Agendar ${plan.fechas.length} sesiones` : "Agendar cita"}</button>
  </div>`;
  if (m.firstElementChild) m.firstElementChild.scrollTop = sc;
}

function agendar() {
  const v = D.ventas.find((x) => x.id === nc.ventaId);
  const dur = durSrv(nc.srv);
  const base = { pacienteId: nc.cli, servicioId: nc.srv, hora: nc.hora, ventaId: v ? v.id : "",
    precio: v ? 0 : +nc.precio || 0, estado: "pendiente" };
  let n = 1;
  if (v && nc.bloque) {
    const p = planBloque(v);
    n = p.fechas.length;
    if (!n) return;
    p.fechas.forEach((f) => D.citas.push({ id: uid(), fecha: f, ...base, recurso: recursoLibre(f, nc.hora, dur, "") }));
  } else {
    if (choca(nc.fecha, nc.hora, dur, nc.reprogramaDe)) return;
    if (nc.reprogramaDe) {
      const vieja = D.citas.find((c) => c.id === nc.reprogramaDe);
      if (vieja) vieja.estado = "reprogramada";
    }
    D.citas.push({ id: uid(), fecha: nc.fecha, ...base, recurso: recursoLibre(nc.fecha, nc.hora, dur, nc.reprogramaDe) });
  }
  guardar();
  aviso(n === 1 ? (nc.reprogramaDe ? "Cita reprogramada: " : "Cita agendada: ") + C(nc.cli).nombre + ", " + fDia(nc.fecha) + " " + hora12(nc.hora)
    : n + " citas agendadas para " + C(nc.cli).nombre);
  cerrarModal();
  render();
}

function abrirAbono(id) {
  const v = D.ventas.find((x) => x.id === id);
  if (!v) return;
  abrirDialogo(`<div class="modal-top"><h2>Registrar pago</h2><button type="button" class="btn secundario" data-cerrar="1">Cerrar</button></div>
    <p><strong>${esc(C(v.pacienteId).nombre)}</strong> · ${esc(v.nombre)}</p>
    <p class="muted">Total ${soles(v.precio)} · pagado ${soles(pagado(v))} · debe <strong>${soles(saldoDe(v))}</strong></p>
    <form class="form" id="fAbono" data-venta="${v.id}" style="grid-template-columns:1fr 1fr">
      <label>Monto (S/)<input type="number" name="monto" min="0.5" step="0.5" max="${saldoDe(v)}" value="${saldoDe(v)}" required></label>
      <label>Método<select name="metodo"><option>Efectivo</option><option>Yape</option><option>Plin</option><option>Transferencia</option><option>Tarjeta</option></select></label>
      <label>Fecha<input type="date" name="fecha" value="${hoy()}" required></label>
      <div style="grid-column:1/-1"><button class="btn grande">Registrar pago</button></div>
    </form>`);
}

function abrirMiClave() {
  abrirDialogo(`<div class="modal-top"><h2>Cambiar mi contraseña</h2><button type="button" class="btn secundario" data-cerrar="1">Cerrar</button></div>
    <form class="form" id="fMiClave" style="grid-template-columns:1fr">
      <label>Contraseña actual<input type="password" name="actual" required></label>
      <label>Nueva contraseña (mínimo 6)<input type="password" name="nueva" minlength="6" required></label>
      <label>Repetir nueva contraseña<input type="password" name="repetir" minlength="6" required></label>
      <p class="error msg"></p>
      <button class="btn grande">Guardar</button>
    </form>`);
}

/* ---------- HOY, MAÑANA E IMPRESIÓN ---------- */
vistas.hoy = function () {
  const h = hoy(), m = manana(), lh = citasDe(h), lm = citasDe(m);
  const faltan = lm.filter((c) => !c.recordado && telWA(C(c.pacienteId).telefono)).length;
  const bloque = (titulo, f, lista, esHoy, extra) => `<section class="dia"><div class="dia-barra"><h2>${titulo} <span class="muted">${fDia(f)}</span></h2>
    <div class="dia-botones">${extra}<button class="btn secundario" data-imprimir="${f}">Imprimir agenda</button></div></div>
    ${lista.length ? lista.map((c) => filaHoy(c, esHoy)).join("") : '<div class="vacio">No hay citas.</div>'}</section>`;
  return bloque("Hoy", h, lh, true, "") +
    bloque("Mañana", m, lm, false, lm.length ? `<button class="btn" data-recordar="1" ${faltan ? "" : "disabled"}>${faltan ? `Recordar a los de mañana (${faltan})` : "Todos avisados"}</button>` : "");
};

function imprimir(f) {
  $("#hojaImpresion").innerHTML = `<h1>${esc(D.ajustes.clinica)} · Agenda</h1><h2>${fDia(f)}</h2>
    <table><thead><tr><th>Hora</th><th>Cliente</th><th>Teléfono</th><th>Servicio</th><th>Sala</th><th>Cobro</th><th>Pago</th></tr></thead><tbody>
    ${citasDe(f).map((c) => `<tr><td>${hora12(c.hora)}</td><td>${esc(C(c.pacienteId).nombre)}</td><td>${esc(C(c.pacienteId).telefono)}</td>
    <td>${esc(S(c.servicioId).nombre)}</td><td>${esc(c.recurso || "")}</td><td>${c.ventaId ? "Paquete" : soles(c.precio)}</td><td></td></tr>`).join("")}</tbody></table>`;
  window.print();
}

/* ---------- RENDER Y NAVEGACIÓN ---------- */
function render() {
  $("#hoy").textContent = new Date().toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if (YO) $("#quien").textContent = YO.nombre + (YO.owner ? " · Administradora" : "");
  const lista = secciones();
  if (!lista.includes(pestanaActual)) pestanaActual = lista[0] || "sinacceso";
  $("#nav").innerHTML = lista.map((id) => `<button data-tab="${id}" class="${id === pestanaActual ? "activa" : ""}">${ETQ_SEC[id]}</button>`).join("");
  try {
    $("#app").innerHTML = (vistas[pestanaActual] || vistas.sinacceso)();
  } catch (err) {
    console.error(err);
    $("#app").innerHTML = `<div class="caja error"><strong>Esta sección tuvo un error.</strong>
      <p class="muted">${esc(err.message)}</p><p class="muted">Avísame con este mensaje para corregirlo.</p></div>`;
  }
  $("#btnNueva").hidden = !puede("citas");
  latirSala();
}

$("#btnMiClave").addEventListener("click", abrirMiClave);

/* ---------- EVENTOS: CLIC ---------- */
document.addEventListener("click", async (e) => {
  const q = (s) => e.target.closest(s);
  const d = (s, k) => { const el = q(s); return el ? el.dataset[k] : undefined; };

  // Diálogos
  if (q("[data-dlg]")) {
    const r = resolverDialogo;
    resolverDialogo = null;
    cerrarModal();
    return r && r(d("[data-dlg]", "dlg") === "1");
  }
  if (q("[data-cerrar]")) return cerrarModal();

  // Navegación
  if (q("[data-tab]")) {
    const t = d("[data-tab]", "tab");
    if (secciones().includes(t)) { pestanaActual = t; clienteSel = null; render(); }
    return;
  }
  if (q("[data-nueva]") || q("#btnNueva")) { if (puede("citas")) abrirNueva(); return; }
  if (q("[data-per]")) { periodo = d("[data-per]", "per"); return render(); }
  if (q("[data-fil]")) { filtroCli = d("[data-fil]", "fil"); return render(); }
  if (q("[data-cli]")) { clienteSel = d("[data-cli]", "cli"); render(); window.scrollTo(0, 0); return; }
  if (q("[data-volver]")) { clienteSel = null; return render(); }
  if (q("[data-cfg]")) { cfgTab = d("[data-cfg]", "cfg"); return render(); }
  if (q("[data-imprimir]")) return imprimir(d("[data-imprimir]", "imprimir"));
  if (q("[data-irclientes]") && nc) { cerrarModal(); pestanaActual = "clientes"; clienteSel = null; return render(); }

  // Pantalla de sala
  if (q("[data-fullscreen]")) {
    if (document.fullscreenElement) document.exitFullscreen();
    else {
      document.documentElement.requestFullscreen?.();
      navigator.wakeLock?.request("screen").catch(() => {});
    }
    return;
  }
  if (q("[data-sdet]")) { salaCobroId = null; return abrirSalaDetalle(d("[data-sdet]", "sdet")); }
  if (q("[data-sacc]")) {
    const c = D.citas.find((x) => x.id === d("[data-sacc]", "id"));
    const est = d("[data-sacc]", "sacc");
    if (!c) return;
    if (est === "atendida" && d("[data-sacc]", "cobra") === "1") { salaCobroId = c.id; return abrirSalaDetalle(c.id); }
    c.estado = est;
    if (est === "atendida") c.pago = c.ventaId ? "Paquete" : "";
    if (est === "pendiente") c.pago = "";
    salaCobroId = null;
    guardar(); cerrarModal(); return render();
  }
  if (q("[data-spago]")) {
    const c = D.citas.find((x) => x.id === d("[data-spago]", "id"));
    if (c) { c.estado = "atendida"; c.pago = d("[data-spago]", "spago"); }
    salaCobroId = null;
    guardar(); cerrarModal(); return render();
  }

  // Hoy: estados y cobro
  if (q("[data-acc]")) {
    const c = D.citas.find((x) => x.id === d("[data-acc]", "id"));
    const est = d("[data-acc]", "acc");
    if (!c) return;
    if (est === "atendida" && !c.ventaId && +c.precio > 0) { cobrando = c.id; return render(); }
    c.estado = est;
    if (est === "atendida") c.pago = c.ventaId ? "Paquete" : "";
    if (est === "pendiente") c.pago = "";
    guardar();
    return render();
  }
  if (q("[data-pago]")) {
    const c = D.citas.find((x) => x.id === d("[data-pago]", "id"));
    if (!c) return;
    c.estado = "atendida"; c.pago = d("[data-pago]", "pago"); cobrando = null;
    guardar(); return render();
  }
  if (q("[data-cancobro]")) { cobrando = null; return render(); }
  if (q("[data-recordado]")) {
    const c = D.citas.find((x) => x.id === d("[data-recordado]", "recordado"));
    if (c) { c.recordado = true; guardar(); }
    setTimeout(render, 300);
    return;
  }
  if (q("[data-recordar]")) {
    const c = citasDe(manana()).find((x) => !x.recordado && telWA(C(x.pacienteId).telefono));
    if (c) { window.open(urlWA(c), "_blank"); c.recordado = true; guardar(); render(); }
    return;
  }
  if (q("[data-reprog]")) {
    const c = D.citas.find((x) => x.id === d("[data-reprog]", "reprog"));
    if (c) abrirNueva({ cli: c.pacienteId, srv: c.servicioId, ventaId: c.ventaId, precio: c.precio, reprogramaDe: c.id, fecha: hoy() });
    return;
  }
  if (q("[data-siguiente]")) {
    const c = D.citas.find((x) => x.id === d("[data-siguiente]", "siguiente"));
    if (c) abrirNueva({ cli: c.pacienteId, srv: c.servicioId, ventaId: c.ventaId, precio: 0, fecha: sumarDias(c.fecha, 7), hora: c.hora });
    return;
  }

  // Eliminaciones (con aviso de lo que pasa con las citas)
  if (q("[data-delcita]")) {
    const c = D.citas.find((x) => x.id === d("[data-delcita]", "delcita"));
    if (!c) return;
    const extra = reservaSesion(c) ? " Se devolverá una sesión al paquete." : "";
    if (await confirmar(`¿Eliminar la cita de ${esc(C(c.pacienteId).nombre)}?${extra}`, "Sí, eliminar")) {
      D.citas = D.citas.filter((x) => x !== c); guardar(); render();
    }
    return;
  }
  if (q("[data-delventa]")) {
    const v = D.ventas.find((x) => x.id === d("[data-delventa]", "delventa"));
    if (!v) return;
    const pend = D.citas.filter((c) => c.ventaId === v.id && ["pendiente", "llego"].includes(c.estado)).length;
    const ok = await confirmar(`¿Eliminar el paquete ${esc(v.nombre)} de ${esc(C(v.pacienteId).nombre)}?
      ${pend ? `Se eliminarán también ${pend} citas programadas. ` : ""}Las citas ya atendidas se conservan como atención normal.`, "Sí, eliminar");
    if (!ok) return;
    D.citas = D.citas.filter((c) => !(c.ventaId === v.id && ["pendiente", "llego"].includes(c.estado)));
    D.citas.forEach((c) => { if (c.ventaId === v.id) { c.ventaId = ""; c.precio = 0; c.pago = "Paquete"; } });
    D.ventas = D.ventas.filter((x) => x !== v);
    guardar(); aviso("Paquete eliminado"); render();
    return;
  }
  if (q("[data-delsrv]")) {
    const s = D.servicios.find((x) => x.id === d("[data-delsrv]", "delsrv"));
    if (!s) return;
    const n = D.citas.filter((c) => c.servicioId === s.id).length;
    if (await confirmar(`¿Eliminar el servicio ${esc(s.nombre)}?${n ? ` ${n} citas quedarán con "(servicio eliminado)".` : ""}`, "Sí, eliminar")) {
      D.servicios = D.servicios.filter((x) => x !== s); guardar(); render();
    }
    return;
  }
  if (q("[data-delpaq]")) {
    const p = D.paquetes.find((x) => x.id === d("[data-delpaq]", "delpaq"));
    if (p && await confirmar(`¿Eliminar el paquete ${esc(p.nombre)} del catálogo? Las ventas ya hechas no se afectan.`, "Sí, eliminar")) {
      D.paquetes = D.paquetes.filter((x) => x !== p); guardar(); render();
    }
    return;
  }

  // Paquetes
  if (q("[data-abonar]")) return abrirAbono(d("[data-abonar]", "abonar"));
  if (q("[data-extender]")) {
    const v = D.ventas.find((x) => x.id === d("[data-extender]", "extender"));
    if (!v) return;
    v.vence = sumarDias(v.vence < hoy() ? hoy() : v.vence, 30);
    guardar(); aviso("Vigencia extendida hasta " + fCorta(v.vence)); render();
    return;
  }

  // Configuración (solo la administradora)
  if (q("[data-exportar]")) { if (YO && YO.owner) exportar(); return; }
  if (q("[data-reset]")) {
    const u = USUARIOS.find((x) => x.id === d("[data-reset]", "reset"));
    if (YO && YO.owner && u) {
      try { await sendPasswordResetEmail(auth, u.usuario); aviso("Enlace enviado a " + u.usuario); }
      catch (err) { alert(mensajeAuth(err)); }
    }
    return;
  }
  if (q("[data-toggle-user]")) {
    const u = USUARIOS.find((x) => x.id === d("[data-toggle-user]", "toggleUser"));
    if (YO && YO.owner && u && !u.owner) {
      const nuevo = !u.activo;
      try {
        await updateDoc(doc(db, "usuarios", u.id), { activo: nuevo });
        u.activo = nuevo;
      } catch (err) { alert(mensajeAuth(err)); }
      render();
    }
    return;
  }
  if (q("[data-del-user]")) {
    const u = USUARIOS.find((x) => x.id === d("[data-del-user]", "delUser"));
    if (YO && YO.owner && u && !u.owner &&
        await confirmar(`¿Quitar el acceso de ${esc(u.nombre)}? Ya no podrá entrar a la app.`, "Sí, quitar")) {
      try {
        await deleteDoc(doc(db, "usuarios", u.id));
        USUARIOS.splice(USUARIOS.indexOf(u), 1);
      } catch (err) { alert(mensajeAuth(err)); }
      render();
    }
    return;
  }

  // Nueva cita (ventana)
  if (!nc) return;
  if (q("[data-nccli]")) {
    nc.cli = d("[data-nccli]", "nccli");
    nc.ventaId = ventasActivas(nc.cli)[0]?.id || "";
    nc.bloque = false;
    return dibujarModal();
  }
  if (q("[data-nccambiar]")) { nc.cli = ""; nc.ventaId = ""; nc.bloque = false; return dibujarModal(); }
  if (q("[data-ncsrv]")) {
    nc.srv = d("[data-ncsrv]", "ncsrv");
    nc.precio = S(nc.srv).precio || 0;
    return dibujarModal();
  }
  if (q("[data-nccobro]")) {
    nc.ventaId = d("[data-nccobro]", "nccobro") || "";
    if (!nc.ventaId) nc.bloque = false;
    return dibujarModal();
  }
  if (q("[data-ncfecha]")) { nc.fecha = d("[data-ncfecha]", "ncfecha") === "hoy" ? hoy() : manana(); return dibujarModal(); }
  if (q("[data-ncdia]")) {
    const n = +d("[data-ncdia]", "ncdia");
    nc.dias = nc.dias.includes(n) ? nc.dias.filter((x) => x !== n) : [...nc.dias, n];
    return dibujarModal();
  }
  if (q("[data-nchora]")) { nc.hora = d("[data-nchora]", "nchora"); return dibujarModal(); }
  if (q("[data-ncok]")) return agendar();
});

/* ---------- EVENTOS: ESCRIBIR Y CAMBIAR ---------- */
document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.id === "buscar") { textoBusqueda = t.value; $("#lista").innerHTML = listaClientesHTML(); return; }
  if (t.id === "buscarSrv") { textoSrv = t.value; $("#listaSrv").innerHTML = listaSrvHTML(); return; }
  if (!nc) return;
  if (t.id === "ncBusca") { nc.q = t.value; $("#ncRes").innerHTML = resCli(); }
  else if (t.id === "ncBuscaSrv") { nc.qs = t.value; $("#ncResSrv").innerHTML = resSrv(); }
  else if (t.id === "ncPrecio") nc.precio = t.value;
});

document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.dataset.st && t.value) {
    const c = D.citas.find((x) => x.id === t.dataset.st);
    if (c) {
      c.estado = t.value;
      if (c.estado === "atendida") c.pago = c.ventaId ? "Paquete" : (c.pago || "");
      guardar(); render();
    }
    return;
  }
  if (t.dataset.salasel) {
    const c = D.citas.find((x) => x.id === t.dataset.salasel);
    const dur = c ? durSrv(c.servicioId) : 0, a = c ? aMin(c.hora) : 0;
    const ocupada = c && D.citas.some((x) => x.id !== c.id && x.fecha === c.fecha && x.recurso === t.value &&
      ocupaHorario(x) && seSolapan(x, a, a + dur));
    if (ocupada) { alert("Esa sala ya está ocupada en ese horario."); t.value = c.recurso; return; }
    if (c) { c.recurso = t.value; guardar(); render(); }
    return;
  }
  if (t.id === "filtro") { filtroCitas = t.value; return render(); }
  if (t.id === "impFile" && t.files[0]) return importar(t.files[0]);
  if (t.id === "selPaq") { const el = $("#inPaqPrecio"); if (el) el.value = t.selectedOptions[0].dataset.p; return; }
  if (!nc) return;
  if (t.id === "ncFecha" && t.value) { nc.fecha = t.value; dibujarModal(); }
  if (t.id === "ncBloque") { nc.bloque = t.checked; dibujarModal(); }
});

/* ---------- EVENTOS: FORMULARIOS ---------- */
document.addEventListener("submit", async (e) => {
  const f = e.target;
  if (f.id === "formLogin") return; // lo maneja su propio listener
  e.preventDefault();
  const d = Object.fromEntries(new FormData(f));

  // Registro de clientes (público y desde el panel)
  if (f.id === "fCliPublico" || f.id === "fCli") {
    const msg = f.querySelector(".msg");
    const err = validarCliente(d);
    if (err) { msg.className = "error msg"; msg.textContent = err; return; }
    crearCliente(d); guardar(); f.reset();
    if (f.id === "fCliPublico") { msg.className = "ok msg"; msg.textContent = "¡Registro guardado! Gracias por registrarte."; return; }
    aviso("Cliente registrado");
    return render();
  }
  if (f.id === "fSrv") {
    D.servicios.push({ id: uid(), nombre: d.nombre.trim(), precio: +d.precio, duracion: +d.duracion || D.ajustes.duracionDefault });
    guardar(); f.reset(); aviso("Servicio guardado"); return render();
  }
  if (f.id === "fPaq") {
    D.paquetes.push({ id: uid(), nombre: d.nombre.trim(), sesiones: +d.sesiones, precio: +d.precio });
    guardar(); return render();
  }
  if (f.id === "fVenta") {
    const q = D.paquetes.find((x) => x.id === d.paqueteId);
    if (!q) return;
    const pago = +d.pago || 0;
    D.ventas.push({ id: uid(), pacienteId: d.pacienteId, nombre: q.nombre, sesiones: q.sesiones, precio: +d.precio,
      fecha: d.fecha, vence: sumarDias(d.fecha, D.ajustes.vigenciaDias),
      abonos: pago > 0 ? [{ fecha: d.fecha, monto: pago, metodo: d.metodo }] : [] });
    guardar(); aviso("Paquete vendido"); return render();
  }
  if (f.id === "fAbono") {
    const v = D.ventas.find((x) => x.id === f.dataset.venta);
    if (!v) return;
    const monto = Math.min(+d.monto || 0, saldoDe(v));
    if (monto <= 0) return;
    v.abonos.push({ fecha: d.fecha, monto, metodo: d.metodo });
    guardar(); cerrarModal(); aviso("Pago registrado: " + soles(monto)); return render();
  }
  if (f.id === "fMiClave") {
    const msg = f.querySelector(".msg");
    if (d.nueva !== d.repetir) { msg.textContent = "Las contraseñas nuevas no coinciden."; return; }
    try {
      const user = auth.currentUser;
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, d.actual));
      await updatePassword(user, d.nueva);
      cerrarModal(); aviso("Contraseña actualizada");
    } catch (err) {
      const c = (err && err.code) || "";
      msg.textContent = c.includes("invalid-credential") || c.includes("wrong-password")
        ? "La contraseña actual no es correcta." : mensajeAuth(err);
    }
    return;
  }

  // Configuración
  if (f.id === "fUsuario") {
    if (!YO || !YO.owner) return;
    const correo = d.usuario.trim().toLowerCase();
    if (USUARIOS.some((u) => u.usuario === correo)) { alert("Ya existe un usuario con ese correo."); return; }
    try {
      const permisos = [...f.querySelectorAll("input[name=sec]:checked")].map((i) => i.value);
      const uidNuevo = await crearCuentaAuth(correo, d.clave);
      const datos = { nombre: d.nombre.trim(), usuario: correo, owner: false, activo: true, permisos };
      await setDoc(doc(db, "usuarios", uidNuevo), datos);
      USUARIOS.push({ ...datos, id: uidNuevo });
      f.reset(); aviso("Usuario creado: " + datos.nombre); return render();
    } catch (err) {
      alert(mensajeAuth(err));
      return;
    }
  }
  if (f.dataset.permisos) {
    if (!YO || !YO.owner) return;
    const u = USUARIOS.find((x) => x.id === f.dataset.permisos);
    if (u && !u.owner) {
      u.permisos = [...f.querySelectorAll("input[name=sec]:checked")].map((i) => i.value);
      try {
        await updateDoc(doc(db, "usuarios", u.id), { permisos: u.permisos });
        aviso("Accesos guardados: " + u.nombre);
      } catch (err) { alert(mensajeAuth(err)); }
    }
    return;
  }
  if (f.id === "fAjustes") {
    if (aMin(d.fin) <= aMin(d.inicio)) { alert("La hora de cierre debe ser posterior a la de inicio."); return; }
    const recs = (d.recursos || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!recs.length) { alert("Escribe al menos una sala o camilla."); return; }
    Object.assign(D.ajustes, {
      clinica: d.clinica.trim(), inicio: d.inicio, fin: d.fin, paso: +d.paso,
      duracionDefault: +d.duracionDefault, vigenciaDias: +d.vigenciaDias,
      novinoConsume: !!d.novinoConsume, recursos: recs,
      formularioUrl: (d.formularioUrl || "").trim(), formularioMin: +d.formularioMin || 5,
    });
    D.citas.forEach((c) => { if (!recs.includes(c.recurso)) c.recurso = recs[0]; });
    guardar(); aviso("Ajustes guardados");
    if (D.ajustes.formularioUrl) sincronizarFormulario(true);
    return render();
  }
});


/* ---------- PACIENTES NUEVOS ---------- */
let filtroNuevos = "semana";
vistas.nuevos = function () {
  if (clienteSel) return detalleCliente(clienteSel);
  const r = RANGOS();
  const ant = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); const m = aISO(d).slice(0, 7); return [m + "-01", m + "-31"]; })();
  const rg = { semana: r.semana, mes: r.mes, anterior: ant };
  const en = (k) => D.clientes.filter((c) => c.registro >= rg[k][0] && c.registro <= rg[k][1]);
  const sel = rg[filtroNuevos] ? filtroNuevos : "semana";
  const nombres = { semana: "esta semana", mes: "este mes", anterior: "el mes pasado" };
  const tuvoCita = (c) => D.citas.some((x) => x.pacienteId === c.id && x.estado !== "cancelada") ||
    D.atenciones.some((a) => a.pacienteId === c.id) || D.ventas.some((v) => v.pacienteId === c.id);
  const lista = en(sel).sort((a, b) => (b.registro + (b.registroHora || "")).localeCompare(a.registro + (a.registroHora || "")));
  const sinCita = lista.filter((c) => !tuvoCita(c)).length;
  const tj = (k, t) => `<div class="tarjeta ${sel === k ? "sel" : ""}" data-nfil="${k}"><span class="muted">${t}</span><div class="cifra">${en(k).length}</div><small>pacientes nuevos</small></div>`;
  const fila = (c) => {
    const wa = telWA(c.telefono);
    const msg = `Hola ${nombreCorto(c.nombre)}, ¡${c.sexo === "Mujer" ? "bienvenida" : "bienvenido"} a Perla Ayurveda! Gracias por registrarte. ¿Le gustaría agendar su primera cita?`;
    return `<div class="fila"><div class="crece"><strong>${esc(c.nombre)}</strong>
      <div class="muted">DNI ${esc(c.dni)} · ${esc(c.telefono || "sin teléfono")}${c.distrito ? " · " + esc(c.distrito) : ""}</div>
      <div class="muted">Se registró el ${fDia(c.registro)}${c.registroHora ? ", " + hora12(c.registroHora) : ""}${c.fuente === "formulario" ? " · formulario" : ""}</div></div>
      ${dniDudoso(c.dni) ? '<span class="etq cancelada">Revisar DNI</span>' : ""}
      <span class="etq ${tuvoCita(c) ? "atendida" : "llego"}">${tuvoCita(c) ? "Ya tiene cita" : "Sin cita todavía"}</span>
      <div class="acciones">
        ${puede("citas") ? `<button type="button" class="btn secundario" data-agendarcli="${c.id}">Agendar</button>` : ""}
        ${wa ? `<a class="btn secundario" target="_blank" rel="noopener" href="https://wa.me/${wa}?text=${encodeURIComponent(msg)}">WhatsApp</a>` : ""}
        ${puede("clientes") ? `<button type="button" class="btn secundario" data-cli="${c.id}">Ver ficha</button>` : ""}
      </div></div>`;
  };
  return `<h2>Pacientes nuevos</h2>
    <div class="caja" id="syncEstado">${syncHTML()}</div>
    <div class="tarjetas">${tj("semana", "Esta semana")}${tj("mes", "Este mes")}${tj("anterior", "Mes pasado")}</div>
    <section class="caja"><h3>Registrados ${nombres[sel]} (${lista.length})${lista.length ? " · " + sinCita + " sin cita todavía" : ""}</h3>
      ${lista.length ? lista.map(fila).join("") : '<div class="vacio">Nadie se ha registrado ' + nombres[sel] + ".</div>"}</section>
    ${puede("clientes") ? `<details class="caja"><summary>Importar sin enlace (archivo o filas copiadas)</summary>
      <p class="muted">En tu hoja de Google: Archivo → Descargar → CSV, y súbelo aquí. O selecciona las filas, cópialas y pégalas abajo (con los títulos de las columnas).</p>
      <input type="file" id="impCSV" accept=".csv,text/csv,text/plain">
      <textarea id="impTexto" placeholder="Pega aquí las filas copiadas de la hoja"></textarea>
      <button type="button" class="btn" data-imptexto="1" style="margin-top:8px">Importar lo pegado</button>
      <p class="msg" id="impMsg"></p></details>` : ""}`;
};

// Clics de esta sección (aparte del manejador principal)
document.addEventListener("click", (e) => {
  const q = (s) => e.target.closest(s);
  if (q("[data-nfil]")) { filtroNuevos = q("[data-nfil]").dataset.nfil; render(); return; }
  if (q("[data-sync]")) { sincronizarFormulario(true); return; }
  if (q("[data-irconfig]")) { pestanaActual = "configuracion"; cfgTab = "ajustes"; render(); return; }
  if (q("[data-agendarcli]")) { if (puede("citas")) abrirNueva({ cli: q("[data-agendarcli]").dataset.agendarcli }); return; }
  if (q("[data-imptexto]")) {
    const txt = ($("#impTexto").value || "").trim(), msg = $("#impMsg");
    if (!txt) { msg.textContent = "Pega primero las filas."; return; }
    try { const r = importarTexto(txt); aviso(r.nuevos + " pacientes nuevos agregados"); render(); }
    catch (err) { msg.className = "error msg"; msg.textContent = err.message; }
  }
});
document.addEventListener("change", async (e) => {
  if (e.target.id !== "impCSV" || !e.target.files[0]) return;
  try { const r = importarTexto(await e.target.files[0].text()); aviso(r.nuevos + " pacientes nuevos agregados"); render(); }
  catch (err) { const m = $("#impMsg"); if (m) { m.className = "error msg"; m.textContent = err.message; } }
});

// Lectura automática: al abrir, cada tantos minutos y al volver a la pestaña
setInterval(() => {
  const min = Math.max(1, +D.ajustes.formularioMin || 5);
  if (YO && !$("#panel").hidden && D.ajustes.formularioUrl && Date.now() - sync.ultima >= min * 60000) sincronizarFormulario(false);
}, 30000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && YO && D.ajustes.formularioUrl && Date.now() - sync.ultima >= 60000) sincronizarFormulario(false);
});

/* ---------- RENOVACIONES: POR FINALIZAR Y FINALIZARON ---------- */
let preVenta = "";
// Casos que la clínica ya conocía antes de usar la app (se agregan una sola vez)
const SEG_INICIAL = [
  { dni: "70756171", estado: "finalizo", paquete: "", fecha: "" },
  { dni: "21802487", estado: "finalizo", paquete: "", fecha: "" },
  { dni: "90217775", estado: "finalizo", paquete: "", fecha: "" },
  { dni: "21855337", estado: "por_finalizar", paquete: "PAQUETE TERAPIA (11 SESIONES)", fecha: "2026-11-21" },
];
function sembrarSeguimiento() {
  D.sembrados ||= [];
  if (D.sembrados.includes("seg-nov-2026")) return;
  SEG_INICIAL.forEach((x) => {
    const c = D.clientes.find((k) => k.dni === x.dni);
    if (c) D.seguim.manual.push({ id: uid(), pacienteId: c.id, estado: x.estado, paquete: x.paquete, fecha: x.fecha, nota: "", creado: hoy() });
  });
  D.sembrados.push("seg-nov-2026");
  guardar();
}

const paqueteReciente = (cid) => {
  const a = D.atenciones.filter((x) => x.pacienteId === cid && /^PAQUETE/i.test(x.servicio || "")).sort((p, q) => q.fecha.localeCompare(p.fecha))[0];
  return a ? titulo(a.servicio) : "";
};

// Arma las dos listas: paquetes vendidos en la app (automático) + casos anotados a mano
function renovaciones() {
  const h = hoy(), av = +D.ajustes.avisoSesiones || 2, fin = [], por = [];
  D.ventas.forEach((v, i) => {
    if (D.ventas.some((w, j) => j > i && w.pacienteId === v.pacienteId && w.fecha >= v.fecha)) return; // ya renovó
    const usadas = usadasDe(v), quedan = v.sesiones - usadas;
    const progs = D.citas.filter((c) => c.ventaId === v.id && ["pendiente", "llego"].includes(c.estado)).map((c) => c.fecha).sort();
    const ultUso = D.citas.filter((c) => c.ventaId === v.id && c.estado === "atendida").map((c) => c.fecha).sort().pop() || v.fecha;
    const base = { clave: "v:" + v.id, cid: v.pacienteId, paquete: v.nombre, sesiones: v.sesiones, usadas, quedan, vence: v.vence, auto: true };
    if (quedan <= 0) fin.push({ ...base, fecha: ultUso, motivo: "completo" });
    else if (v.vence < h) fin.push({ ...base, fecha: v.vence, motivo: "vencio" });
    else if (quedan <= av || diasEntre(v.vence) <= 15)
      por.push({ ...base, fecha: progs.length >= quedan ? progs[quedan - 1] : "", motivo: "auto" });
  });
  D.seguim.manual.forEach((m) => {
    const desde = m.fecha || m.creado;
    if (D.ventas.some((w) => w.pacienteId === m.pacienteId && w.fecha >= desde)) return; // ya renovó
    const base = { clave: "m:" + m.id, cid: m.pacienteId, paquete: m.paquete || paqueteReciente(m.pacienteId), fecha: m.fecha, nota: m.nota, auto: false };
    if (m.estado === "finalizo") fin.push({ ...base, motivo: "manual" });
    else if (m.fecha && m.fecha < h) fin.push({ ...base, motivo: "fecha" });
    else por.push({ ...base, motivo: "manual" });
  });
  const visible = (x) => !(D.seguim.marcas[x.clave] || {}).oculto;
  const cmp = (a, b, dir) => (!a.fecha && !b.fecha ? 0 : !a.fecha ? 1 : !b.fecha ? -1 : dir * a.fecha.localeCompare(b.fecha));
  return { fin: fin.filter(visible).sort((a, b) => cmp(a, b, -1)), por: por.filter(visible).sort((a, b) => cmp(a, b, 1)) };
}

function filaSeg(x, tipo) {
  const c = C(x.cid), m = D.seguim.marcas[x.clave] || {}, wa = telWA(c.telefono), h = hoy();
  const paq = x.paquete ? `su paquete "${x.paquete}"` : "su paquete de sesiones";
  const msg = tipo === "fin"
    ? `Hola ${nombreCorto(c.nombre)}, esperamos que se encuentre muy bien. Ya completó ${paq} en Perla Ayurveda. ¿Le gustaría renovarlo para continuar con su tratamiento?`
    : x.fecha === h ? `Hola ${nombreCorto(c.nombre)}, hoy finaliza ${paq} en Perla Ayurveda. ¿Desea que coordinemos su renovación para continuar su tratamiento?`
    : `Hola ${nombreCorto(c.nombre)}, ${x.auto ? "le quedan " + x.quedan + " sesiones de" : "está por finalizar"} ${paq} en Perla Ayurveda. ¿Desea que coordinemos su renovación?`;
  const ult = historial(x.cid).find(esTerapia);
  let estado;
  if (tipo === "por") {
    estado = x.fecha === h ? '<span class="etq llego">Finaliza HOY</span>'
      : x.fecha ? `<span class="etq">Finaliza ${x.fecha === manana() ? "mañana" : fDia(x.fecha)}</span>`
      : x.auto && diasEntre(x.vence) <= 15 ? `<span class="etq">Vence en ${diasEntre(x.vence)} días</span>` : '<span class="etq">Por terminar</span>';
  } else {
    const hace = x.fecha ? ` · hace ${Math.max(0, -diasEntre(x.fecha))} días` : "";
    estado = x.motivo === "completo" ? `<span class="etq atendida">Completó sus sesiones${x.fecha ? " · " + fDia(x.fecha) + hace : ""}</span>`
      : x.motivo === "vencio" ? `<span class="etq cancelada">Venció con ${x.quedan} sesiones sin usar</span>`
      : `<span class="etq atendida">Finalizó su paquete${x.fecha ? " · " + fDia(x.fecha) + hace : ""}</span>`;
  }
  return `<div class="fila"><div class="crece"><strong>${esc(c.nombre)}</strong>
      <div class="muted">DNI ${esc(c.dni)} · ${esc(c.telefono || "sin teléfono")}</div>
      <div class="muted">${x.paquete ? esc(x.paquete) : "Paquete sin registrar"}${x.auto ? ` · ${x.usadas} de ${x.sesiones} sesiones` : ""}${ult ? " · última visita " + fDia(ult.fecha) : ""}</div>
      ${x.nota ? `<div class="muted">${esc(x.nota)}</div>` : ""}</div>
    ${estado}${m.contactado ? `<span class="etq atendida">Contactado ${fDia(m.contactado)}</span>` : ""}
    <div class="acciones">
      ${wa ? `<a class="btn secundario" target="_blank" rel="noopener" href="https://wa.me/${wa}?text=${encodeURIComponent(msg)}">WhatsApp</a>` : ""}
      <button type="button" class="btn secundario" data-segcontacto="${x.clave}">${m.contactado ? "Quitar marca" : "Ya le escribí"}</button>
      ${puede("paquetes") ? `<button type="button" class="btn secundario" data-renovar="${x.cid}">Vender paquete</button>` : ""}
      <button type="button" class="btn peligro" data-segquitar="${x.clave}">Ya renovó / quitar</button>
    </div></div>`;
}

function vistaSeg(tipo) {
  const lista = renovaciones()[tipo], h = hoy();
  const contactados = lista.filter((x) => (D.seguim.marcas[x.clave] || {}).contactado).length;
  const tj = (t, n, sub) => `<div class="tarjeta" style="cursor:default"><span class="muted">${t}</span><div class="cifra">${n}</div><small>${sub}</small></div>`;
  const titulo2 = tipo === "fin" ? "Pacientes que finalizaron su paquete" : "Pacientes por finalizar su paquete";
  const ayuda = tipo === "fin"
    ? "Terminaron todas sus sesiones (o el paquete venció) y todavía no compraron otro. Desaparecen solos cuando les vendes un paquete nuevo."
    : `Les quedan ${+D.ajustes.avisoSesiones || 2} sesiones o menos, o su paquete vence en 15 días o menos. Desaparecen solos cuando renuevan.`;
  return `<h2>${titulo2}</h2><p class="muted">${ayuda}</p>
    <div class="tarjetas">${tj("Total", lista.length, tipo === "fin" ? "sin renovar" : "por renovar")}
      ${tipo === "por" ? tj("Finalizan hoy", lista.filter((x) => x.fecha === h).length, "hay que ofrecerles renovar") : ""}
      ${tj("Sin contactar", lista.length - contactados, "pendientes de escribirles")}${tj("Contactados", contactados, "ya se les escribió")}</div>
    <div class="caja">${lista.length ? lista.map((x) => filaSeg(x, tipo)).join("") : '<div class="vacio">No hay pacientes en esta lista.</div>'}</div>
    <details class="caja"><summary>+ Agregar un paciente a esta lista</summary>
      <p class="muted">Para paquetes que se vendieron antes de usar la app. Los vendidos desde la app aparecen solos.</p>
      <form class="form" id="fSeg" data-estado="${tipo === "fin" ? "finalizo" : "por_finalizar"}">
        <label>Paciente<input name="cliente" list="dlCli" placeholder="Escribe el nombre o el DNI" autocomplete="off" required></label>
        <label>Paquete (opcional)<input name="paquete" placeholder="Ej.: Paquete terapia (10 sesiones)"></label>
        <label>${tipo === "fin" ? "Fecha en que terminó (opcional)" : "Fecha en que termina"}<input type="date" name="fecha" ${tipo === "por" ? "required" : ""}></label>
        <label>Nota (opcional)<input name="nota"></label>
        <button class="btn">Agregar</button><p class="error msg" style="grid-column:1/-1"></p></form>
      <datalist id="dlCli">${clientesOrdenados().map((c) => `<option value="${esc(c.nombre)} · ${esc(c.dni)}"></option>`).join("")}</datalist></details>`;
}
vistas.finalizaron = () => vistaSeg("fin");
vistas.porfinalizar = () => vistaSeg("por");

document.addEventListener("click", async (e) => {
  const q = (s) => e.target.closest(s);
  if (q("[data-segcontacto]")) {
    const k = q("[data-segcontacto]").dataset.segcontacto, m = (D.seguim.marcas[k] ||= {});
    m.contactado = m.contactado ? "" : hoy(); guardar(); render(); return;
  }
  if (q("[data-segquitar]")) {
    const k = q("[data-segquitar]").dataset.segquitar;
    if (!(await confirmar("¿Quitar a este paciente de la lista? Úsalo si ya renovó o ya no hay que contactarlo.", "Sí, quitar"))) return;
    if (k.startsWith("m:")) D.seguim.manual = D.seguim.manual.filter((m) => "m:" + m.id !== k);
    else (D.seguim.marcas[k] ||= {}).oculto = true;
    guardar(); render(); return;
  }
  if (q("[data-renovar]")) { preVenta = q("[data-renovar]").dataset.renovar; pestanaActual = "paquetes"; clienteSel = null; render(); preVenta = ""; window.scrollTo(0, 0); }
});

document.addEventListener("submit", (e) => {
  const f = e.target;
  if (f.id !== "fSeg") return;
  e.preventDefault();
  const d = Object.fromEntries(new FormData(f)), msg = f.querySelector(".msg");
  const dni = (d.cliente.match(/(\d{8,9})\s*$/) || [])[1], nom = norm(d.cliente.trim());
  const c = (dni && D.clientes.find((x) => x.dni === dni)) || D.clientes.find((x) => norm(x.nombre) === nom);
  if (!c) { msg.textContent = "Elige un paciente de la lista (escribe su nombre o DNI)."; return; }
  D.seguim.manual.push({ id: uid(), pacienteId: c.id, estado: f.dataset.estado, paquete: (d.paquete || "").trim(),
    fecha: d.fecha || "", nota: (d.nota || "").trim(), creado: hoy() });
  guardar(); aviso(c.nombre + " agregado a la lista"); render();
});

/* ---------- ARRANQUE ---------- */
// El arranque ocurre en onAuthStateChanged (ver LOGIN)

// Reloj de la sala: cada segundo; la pantalla completa se redibuja cada 30 segundos
let tic = 0;
setInterval(() => {
  tic++;
  latirSala();
  if (tic % 30 === 0 && pestanaActual === "sala" && YO && !$("#panel").hidden && $("#modal").hidden) render();
}, 1000);


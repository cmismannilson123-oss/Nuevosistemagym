// Parte del flujo del socio (QR). Clásico: mismo ámbito global que antes.
window.wizIr = function(idPantalla){
  const overlay = document.getElementById("wizOverlay");
  if (overlay) overlay.style.display = 'block';
  document.querySelectorAll('#wizOverlay .wiz-screen').forEach(el => el.style.display = 'none');
  const destino = document.getElementById(idPantalla);
  if (destino) destino.style.display = 'block';
};

window.wizVolver = function(){
  // Si estamos en una sub-pantalla (horarios/planes), volvemos al hub "Conoce".
  const horarios = document.getElementById("wizHorarios");
  const planes = document.getElementById("wizPlanes");
  const enSubpantalla = (horarios && horarios.style.display === 'block') || (planes && planes.style.display === 'block');
  if (enSubpantalla) {
    wizIr('wizConoce');
    return;
  }
  // Si estamos en el hub "Conoce", cerramos la ventana flotante y volvemos al inicio.
  const overlay = document.getElementById("wizOverlay");
  if (overlay) overlay.style.display = 'none';
};

// ===== Planes públicos (pantalla "Nuestros planes") =====
// Precios y datos de cada plan. Para cambiar un precio o el precio "antes", edita aquí.
// "antes": precio tachado que se muestra antes del precio actual (si no hay, no se tacha).
// "renov": tiene 10% de descuento por renovación anticipada (solo Mensual y Coach).
// "invitado": tiene cupón de 1 invitado con ingreso libre por un día, cada mes
//             (todos los planes excepto Interdiario y Diario).
const PLANES_PUBLICOS = [
  { id:"mensual", nombre:"Mensual", precio:60, antes:70, periodo:"por 1 mes", renov:true, invitado:true, destacado:false,
    img:"images/planes/mensual.svg", pc:"#22c55e",
    desc:"La opción perfecta para quienes quieren mantenerse en forma, mejorar su salud y crear hábitos duraderos.",
    badge:"Acceso ilimitado al gimnasio por 1 mes",
    incluye:["Máquinas y baile","Guía de instructor general","Asesoría nutricional opcional","Acceso en cualquier horario"] },
  { id:"interdiario", nombre:"Interdiario", precio:40, antes:45, periodo:"", renov:false, invitado:false, destacado:false,
    img:"images/planes/interdiario.svg", pc:"#3b82f6",
    desc:"Perfecto para quienes tienen una rutina ocupada y quieren entrenar con flexibilidad.",
    badge:"Acceso 15 días corridos o interdiario hasta fecha calendario",
    incluye:["Máquinas y baile","Guía de instructor general","Asesoría nutricional si desea, recomendado","Super descuento especial","Acceso 15 días corridos o interdiario hasta fecha calendario"] },
  { id:"trimestral", nombre:"3 Meses", precio:150, antes:170, periodo:"por 3 meses", renov:false, invitado:true, destacado:true,
    img:"images/planes/trimestral.svg", pc:"#a855f7",
    desc:"El plan más recomendado para quienes buscan resultados reales y una transformación constante.",
    badge:"Acceso ilimitado por 3 meses",
    incluye:["El recomendado","Acceso baile y máquinas","Guía de instructor general","Asesoría nutricional opcional si desea, recomendado","Un precio especial"] },
  { id:"estudiante", nombre:"Estudiante", precio:50, antes:60, periodo:"", renov:false, invitado:true, destacado:false,
    img:"images/planes/estudiante.svg", pc:"#f59e0b",
    desc:"Tu etapa, tu energía. Entrena, aprende y alcanza tus metas.",
    badge:"Ojo presentar carnet estudiante",
    incluye:["Acceso máquinas y baile","Instructor general","Asesoría nutricional opcional si desea, recomendado","Descuento especial"] },
  { id:"coach", nombre:"Coach Personalizado", precio:160, antes:190, periodo:"", renov:true, invitado:true, destacado:false,
    img:"images/planes/coach.svg", pc:"#ef4444",
    desc:"Tu progreso, con un plan hecho para ti.",
    badge:"El más recomendado",
    incluye:["Entrenamiento acompañado por un coach","Evaluación física","Seguimiento","Corrección de técnica constante","Rutinas personalizadas con visión y misión a tus objetivos","Entrenamiento para niños, jóvenes, señores o de tercera edad","Entrenamientos de rehabilitación física general","Entrenamiento de alto rendimiento"] },
  { id:"baile", nombre:"Baile y Step", precio:50, antes:60, periodo:"", renov:false, invitado:true, destacado:false,
    img:"images/planes/baile.svg", pc:"#06b6d4",
    desc:"Disfruta, quema calorías y mejora tu condición física.",
    badge:"Super precio especial",
    incluye:["Acceso limitado solo a clases de baile y Step"] },
  { id:"diario", nombre:"Diario", precio:5, antes:8, periodo:"por día", renov:false, invitado:false, destacado:false,
    img:"images/planes/diario.svg", pc:"#8b5cf6",
    desc:"Entrena a tu ritmo, sin compromisos.",
    badge:"Precio único por día",
    incluye:["Acceso baile y máquinas","Instructor general"] },
  { id:"grupo", nombre:"Promo x3 / x4", precios:[{ txt:"Grupo de 3", precio:55 }, { txt:"Grupo de 4", precio:50 }], renov:false, invitado:true, destacado:false,
    img:"images/planes/grupo.svg", pc:"#ec4899",
    desc:"Juntos es mejor. Entrena en grupo y obtén un super precio.",
    badge:"Más motivación, más resultados",
    incluye:["Precios super especial por inscripción en grupos de 3 o 4","Acceso baile y máquinas","Instructor general y asesoría nutricional","Acceso libre en cualquier horario"] }
];
const WSP_PLANES = "51927885791";

function linkWspPlan(p){
  const texto = p.precios
    ? "Hola, quiero la promo para grupos (x3 o x4). ¿Me ayudan a inscribirme?"
    : `Hola, quiero el plan ${p.nombre}${p.precio ? ` (S/ ${p.precio}${p.periodo ? " " + p.periodo : ""})` : ""}. ¿Me ayudan a inscribirme?`;
  return `https://wa.me/${WSP_PLANES}?text=${encodeURIComponent(texto)}`;
}

// Ahorro real calculado con los precios de la lista (3 Meses vs 3 pagos del Mensual)
function ahorroHTML(p){
  if (p.id !== "trimestral") return "";
  const mensual = PLANES_PUBLICOS.find(x => x.id === "mensual");
  const ahorro = mensual.precio * 3 - p.precio;
  return `<div class="pp-ahorro"><i class="fa-solid fa-piggy-bank"></i><span>Pagas <b>S/ ${Math.round(p.precio / 3)} al mes</b> y ahorras <b>S/ ${ahorro}</b> frente a 3 meses de Mensual.</span></div>`;
}

function tarjetaPlanHTML(p, i){
  const renovacion = p.renov ? Math.round(p.precio * 0.9) : null;
  const precioHTML = p.precios
    ? `<div class="pp-grupo">${p.precios.map(g => `<div class="pp-grupo-item"><small>${g.txt}</small><b><span class="pp-moneda">S/</span><span class="pp-num" data-v="${g.precio}">${g.precio}</span></b><span class="pp-per">por persona</span></div>`).join("")}</div>`
    : `<div class="pp-precio">
         ${p.antes ? `<span class="pp-antes">S/ ${p.antes}</span>` : ""}
         <span class="pp-ahora"><span class="pp-moneda">S/</span><span class="pp-num" data-v="${p.precio}">${p.precio}</span></span>
         ${p.periodo ? `<span class="pp-per">${p.periodo}</span>` : ""}
       </div>`;
  const beneficios = p.invitado ? `
      <div class="pp-extra">
        <div class="pp-extra-t">Beneficio por invitado</div>
        <ul class="pp-lista">
          <li><i class="fa-solid fa-user-plus"></i><span>Si tu invitado se inscribe, recibes <b>+3 días</b> adicionales en tu membresía.</span></li>
        </ul>
      </div>` : "";
  const masDe4 = p.incluye.length > 4;
  return `
  <article class="pp-card${p.destacado ? " pp-destacado" : ""}" style="--pc:${p.pc};--d:${(i * 0.07).toFixed(2)}s">
    <div class="pp-arte">
      <img src="${p.img}" alt="" width="800" height="450" loading="lazy" decoding="async">
      ${p.destacado ? `<span class="pp-cinta">Recomendado</span>` : ""}
    </div>
    <div class="pp-cuerpo">
      <div class="pp-cabeza">
        <h3 class="pp-nombre">${p.nombre}</h3>
        <p class="pp-badge">${p.badge}</p>
      </div>
      ${precioHTML}
      ${ahorroHTML(p)}
      ${p.renov ? `<div class="pp-renov"><i class="fa-solid fa-tag"></i><span>Renovando antes de vencer <s class="pp-antes">S/ ${p.precio}</s> <b>S/ ${renovacion}</b></span><em>−10%</em></div>` : ""}
      ${p.invitado ? `<div class="pp-cupon"><i class="fa-solid fa-ticket"></i><span>1 invitado con <b>ingreso libre por un día</b>, cada mes</span></div>` : ""}
      <p class="pp-desc">${p.desc}</p>
      <ul class="pp-lista pp-incluye">
        ${p.incluye.map((t, k) => `<li class="${k > 3 ? "pp-extra-item" : ""}"><i class="fa-solid fa-check"></i><span>${t}</span></li>`).join("")}
      </ul>
      ${masDe4 ? `<button type="button" class="pp-ver-mas" aria-expanded="false">Ver todo (${p.incluye.length})</button>` : ""}
      ${beneficios}
      <a class="pp-wsp" href="${linkWspPlan(p)}" target="_blank" rel="noopener">
        <i class="fa-brands fa-whatsapp"></i><span>Quiero este plan</span><i class="fa-solid fa-arrow-right pp-flecha"></i>
      </a>
    </div>
  </article>`;
}

// Cuenta de 0 hasta el precio (easeOutCubic, ~1,2 s), solo en las tarjetas que entran en pantalla
function contarPrecios(tarjeta){
  tarjeta.querySelectorAll(".pp-num").forEach((el, k) => {
    const final = Number(el.dataset.v);
    const inicio = performance.now() + k * 120;
    const duracion = 1200;
    const paso = (ahora) => {
      const t = Math.min(Math.max((ahora - inicio) / duracion, 0), 1);
      el.textContent = Math.round(final * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(paso);
      else el.textContent = final;
    };
    requestAnimationFrame(paso);
  });
}

function renderPlanesPublicos(cont){
  cont.innerHTML = `<div class="pp-list js-anim">${PLANES_PUBLICOS.map(tarjetaPlanHTML).join("")}</div>`;
  const animar = !window.matchMedia || !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (animar) cont.querySelectorAll(".pp-num").forEach(n => { n.textContent = "0"; });
  // Las animaciones de precio se disparan cuando la tarjeta entra en pantalla (una sola vez)
  const tarjetas = cont.querySelectorAll(".pp-card");
  if ("IntersectionObserver" in window) {
    // Cada vez que la tarjeta entra en pantalla (al abrir "Nuestros planes" o al volver a verla) la animación se vuelve a ejecutar
    const io = new IntersectionObserver((entradas) => {
      entradas.forEach(e => {
        const t = e.target;
        if (e.isIntersecting) {
          t.classList.remove("is-in"); void t.offsetWidth; t.classList.add("is-in");
          if (animar) contarPrecios(t);
        } else {
          t.classList.remove("is-in");
          if (animar) t.querySelectorAll(".pp-num").forEach(n => { n.textContent = "0"; });
        }
      });
    }, { threshold: 0.2 });
    tarjetas.forEach(t => io.observe(t));
  } else {
    tarjetas.forEach(t => { t.classList.add("is-in"); cont.querySelectorAll(".pp-num").forEach(n => { n.textContent = n.dataset.v; }); });
  }
  cont.addEventListener("click", (e) => {
    const boton = e.target.closest(".pp-ver-mas");
    if (!boton) return;
    const tarjeta = boton.closest(".pp-card");
    const abierto = tarjeta.classList.toggle("pp-abierto");
    boton.setAttribute("aria-expanded", abierto ? "true" : "false");
    boton.textContent = abierto ? "Ver menos" : `Ver todo (${tarjeta.querySelectorAll(".pp-incluye li").length})`;
  });
}

window.mostrarBienvenidaPublicaQR = function(){
  wizIr('wizConoce');
  // Reutiliza el botón de catálogo REAL (con miniaturas e imágenes) que ya existe
  // en la pantalla de inicio, en vez de duplicar uno de solo texto.
  const slot = document.getElementById("catalogoBtnWizSlot");
  const original = document.getElementById("btnAbrirCatalogo");
  if (slot && original && !slot.dataset.cargado) {
    const clon = original.cloneNode(true);
    clon.id = "btnAbrirCatalogoWiz";
    clon.setAttribute("onclick", "abrirCatalogoModal()");
    slot.appendChild(clon);
    slot.dataset.cargado = "1";
  }

  const cont = document.getElementById("listaPlanesPublica");
  if (cont && !cont.dataset.cargado) {
    renderPlanesPublicos(cont);
    cont.dataset.cargado = "1";
  }
};

// Se usa desde las tarjetas de "Membresía vencida" / "Membresía agotada" del
// flujo del QR: abre directo la pantalla de planes (la misma que ya existe en
// "Nuevo / Quiero conocer el gym", con su catálogo y su flecha de regreso ya
// funcionando), sin dejar a la persona en un callejón sin salida.
window.abrirPlanesDesdeVencimiento = function(){
  mostrarBienvenidaPublicaQR();
  wizIr('wizPlanes');
};

// Botón de WhatsApp de la pantalla pública: mensaje fijo, directo al número del gym,
// sin pedir ningún dato ni tocar la base de datos.
window.abrirWhatsAppInfo = function(){
  const numero = "51927885791";
  const mensaje = "Hola, quiero información sobre los planes";
  window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`, '_blank');
};

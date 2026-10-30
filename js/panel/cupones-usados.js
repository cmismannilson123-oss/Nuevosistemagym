// Panel: cupones usados hoy y historial del mes.
// Clásico (no módulo): mismo ámbito global y mismo orden que antes.
/* ==========================================================================
   v56 — PANEL: cupones usados (hoy en "Ingreso" + historial del mes en "Invitar")
   Lee listar_cupones_usados (solo personal) y se actualiza en vivo.
   ========================================================================== */
(function(){
  if (document.documentElement.classList.contains('qr-mode')) return;
  var fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone:'America/Lima' });
  function hoyLima(){ return fmtDia.format(new Date()); }
  var MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Setiembre','Octubre','Noviembre','Diciembre'];
  var DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  var NOMBRE = { invitado:'Pase de invitado', descuento:'10% por pago anticipado' };
  function $(id){ return document.getElementById(id); }
  function hora(ts){ return new Date(ts).toLocaleTimeString('es-PE', { hour:'2-digit', minute:'2-digit', hour12:false, timeZone:'America/Lima' }); }
  function fila(c, nuevo){
    var inv = c.tipo === 'invitado', nom = c.nombre || ('DNI ' + c.dni);
    return '<div class="act-item cupc-item' + (nuevo ? ' nuevo' : '') + '">' +
      '<div class="cupc-ic ' + (inv ? 'inv' : 'dto') + '" aria-hidden="true"><i class="fa-solid ' + (inv ? 'fa-user-plus' : 'fa-percent') + '"></i></div>' +
      '<div class="act-main"><div class="act-name">' + escaparHTML(nom) + '</div>' +
      '<div class="act-meta">' + escaparHTML(NOMBRE[c.tipo] || c.tipo) + (c.plan ? ' <span class="cupc-plan">' + escaparHTML(String(c.plan).trim()) + '</span>' : '') + '</div></div>' +
      '<span class="cupc-hora"><i class="fa-regular fa-clock"></i>' + hora(c.usado_en) + '</span></div>';
  }
  async function traer(desde, hasta){
    var r = await supabaseClient.rpc('listar_cupones_usados', { p_desde: desde, p_hasta: hasta });
    if (r.error) throw r.error;
    return r.data || [];
  }

  /* ----- Hoy (pestaña Ingreso) ----- */
  var vistos = null;
  window.cyCargarCuponesHoy = async function(){
    var box = $('cuponesHoy'), n = $('cuponesHoyN'); if (!box) return;
    try {
      var h = hoyLima(), data = await traer(h, h);
      if (!data.length) { box.innerHTML = '<div class="pend-vacio">Nadie usó cupones hoy todavía.</div>'; }
      else box.innerHTML = data.map(function(c){ return fila(c, vistos && !vistos.has(c.id)); }).join('');
      vistos = new Set(data.map(function(c){ return c.id; }));
      if (n) { n.textContent = data.length; n.hidden = !data.length; }
    } catch (e) {
      box.innerHTML = '<div class="pend-vacio">No se pudo cargar. Toca "Actualizar sistema".</div>';
    }
  };

  /* ----- Mes (pestaña Invitar → Cupones) ----- */
  var mes = hoyLima().slice(0, 7); // 'YYYY-MM'
  function rango(m){
    var y = +m.slice(0, 4), mm = +m.slice(5, 7), ult = new Date(Date.UTC(y, mm, 0)).getUTCDate();
    return [m + '-01', m + '-' + String(ult).padStart(2, '0')];
  }
  window.cyCuponesMesMover = function(d){
    var y = +mes.slice(0, 4), mm = +mes.slice(5, 7) + d;
    if (mm < 1) { mm = 12; y--; } if (mm > 12) { mm = 1; y++; }
    var nuevo = y + '-' + String(mm).padStart(2, '0');
    if (nuevo > hoyLima().slice(0, 7)) return;
    mes = nuevo; window.cyCargarCuponesMes();
  };
  window.cyCargarCuponesMes = async function(){
    var box = $('cupMesLista'); if (!box) return;
    $('cupMesTitulo').textContent = MESES[+mes.slice(5, 7) - 1] + ' ' + mes.slice(0, 4);
    var sig = $('cupMesSig'); if (sig) sig.disabled = mes >= hoyLima().slice(0, 7);
    box.innerHTML = '<div class="pend-vacio">Cargando…</div>';
    try {
      var r = rango(mes), data = await traer(r[0], r[1]);
      $('cupTotInv').textContent = data.filter(function(c){ return c.tipo === 'invitado'; }).length;
      $('cupTotDto').textContent = data.filter(function(c){ return c.tipo === 'descuento'; }).length;
      if (!data.length) { box.innerHTML = '<div class="pend-vacio">No se usaron cupones este mes.</div>'; return; }
      var html = '', dia = '';
      data.forEach(function(c){
        var d = fmtDia.format(new Date(c.usado_en));
        if (d !== dia) {
          dia = d; var f = new Date(d + 'T12:00:00');
          html += '<div class="cupm-dia">' + (d === hoyLima() ? 'Hoy' : DIAS[f.getDay()] + ' ' + (+d.slice(8, 10))) + '</div>';
        }
        html += fila(c, false);
      });
      box.innerHTML = html;
    } catch (e) {
      box.innerHTML = '<div class="pend-vacio">No se pudo cargar el historial.</div>';
    }
  };

  /* ----- Arranque y tiempo real (solo con sesión del personal) ----- */
  var t = null;
  function alCambiar(){
    clearTimeout(t);
    t = setTimeout(function(){
      window.cyCargarCuponesHoy();
      var p = $('invPanelCupones'); if (p && p.style.display !== 'none') window.cyCargarCuponesMes();
    }, 300);
  }
  document.addEventListener('DOMContentLoaded', async function(){
    try {
      var s = await supabaseClient.auth.getSession();
      if (!s.data || !s.data.session) return;
      window.cyCargarCuponesHoy();
      var canal = null, reintento = null;
      function suscribir(){
        if (canal && (canal.state === 'joined' || canal.state === 'joining')) return;
        if (canal) { try { supabaseClient.removeChannel(canal); } catch(e){} }
        canal = supabaseClient.channel('cupones-realtime')
          .on('postgres_changes', { event:'INSERT', schema:'public', table:'cupones_uso' }, alCambiar)
          .subscribe(function(st){
            if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') { clearTimeout(reintento); reintento = setTimeout(suscribir, 3000); }
          });
      }
      suscribir();
      document.addEventListener('visibilitychange', function(){
        if (document.visibilityState === 'visible') { suscribir(); alCambiar(); }
      });
      var btn = $('btnActualizar'); if (btn) btn.addEventListener('click', function(){ window.cyCargarCuponesHoy(); });
    } catch (e) {}
  });
})();

// Tinte de color según la hora del dispositivo (presentación).
// Clásico (no módulo): mismo ámbito global y mismo orden que antes.
/* v52: tinte ambiental según la hora del dispositivo (mañana / tarde / noche). Solo cambia colores. */
(function(){ try{ var h=new Date().getHours(), c=document.documentElement.classList;
  c.add(h>=5&&h<12 ? "tod-am" : (h>=19||h<5) ? "tod-night" : "tod-pm"); }catch(e){} })();

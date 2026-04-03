// ============================================================
//  config.js — ÚNICO archivo que debes editar
//  Rellena los valores entre comillas con los tuyos
// ============================================================

const CONFIG = {

  // 1. ID de tu Google Sheet
  //    Coge la parte larga de la URL:
  //    https://docs.google.com/spreadsheets/d/ >>ESTO<< /edit
  SHEET_ID: "1AEjnuGdp3_Rv9L7Bhr5vfciUCZ1i7KPI5_Y87j8y9fY",

  // 2. ID de tu Google Form (la parte e/XXXXX de la URL)
  FORM_ID: "1FAIpQLScF53EI-dQZYajVOhZWDkHXZJcf36mR7afWnXzwIHVEFbLtgQ",

  // 3. Entry IDs del formulario "Que tal fue?"
  FORM_ENTRY_ESTRELLAS:  "entry.1932858161",
  FORM_ENTRY_COMENTARIO: "entry.1529383713",

  // 4. Nombre que aparece en el saludo
  NOMBRE: "Mamá",

  // 5. Bloques de la sesión
  //    tipo    → debe coincidir exactamente con la columna "tipo" del Sheet
  //    cantidad → cuántos ejercicios de ese tipo coger cada día
  //    Si en el Sheet no hay suficientes de ese tipo, coge los que haya
  BLOQUES: [
    { tipo: "calentamiento", cantidad: 1 },
    { tipo: "central",       cantidad: 2 },
    { tipo: "cierre",        cantidad: 1 },
    { tipo: "estiramiento",  cantidad: 1 },
  ],

  // 6. Segundos de descanso entre ejercicios
  DESCANSO_SEGUNDOS: 20,

  // 7. Modo desarrollador: tiempos muy cortos para probar el flujo rápido
  //    false = normal  |  true = ejercicios 10 seg, descansos 2 seg
  DEV_MODE: false,

};

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

  // 5. Cuántos ejercicios mostrar por sesión
  EJERCICIOS_POR_SESION: 4,

  // 6. Duración total en segundos (420 = 7 minutos)
  //    No incluyas el tiempo de descanso aquí, se calcula automáticamente
  DURACION_TOTAL: 420,

  // 7. Segundos de descanso entre ejercicios (60 = 1 minuto)
  DESCANSO_SEGUNDOS: 60,

  // 8. Filtro de grupo (deja vacío "" para usar todos los ejercicios del sheet)
  //    Pon "Suave", "Medio", etc. para usar solo ejercicios de ese grupo
  GRUPO: "",

};

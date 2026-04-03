# MuscleWiki Extractor

## Arrancar

Abre una terminal en esta carpeta y ejecuta:

```
python server.py
```

Luego abre el navegador en: **http://localhost:3333**

## Cómo usar

1. Selecciona **Equipo** (Peso Corporal o Estiramientos)
2. Selecciona **Nivel** (Principiante o Novato)
3. Pulsa **Cargar ejercicios**
4. Navega por la lista — pasa el ratón sobre un ejercicio para ver el vídeo
5. Pulsa un ejercicio para abrirlo y ver la descripción completa
6. Asigna la categoría (Calentamiento / Central / Cierre / Estiramiento)
7. Pulsa **Añadir a selección**
8. Cuando hayas seleccionado todos, pulsa **Generar tabla para Excel**
9. Copia el texto y pégalo directamente en Excel

## Solución de problemas

Si al cargar ejercicios sale un error:

- **Cloudflare bloqueado**: espera 30 segundos y vuelve a intentarlo
- **Estructura desconocida**: la API de MuscleWiki ha cambiado, avisa para actualizar el script
- Revisa la terminal donde ejecutaste `python server.py` para ver los detalles del error

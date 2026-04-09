import os
import sys
from PIL import Image
try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:
    pass

def procesar_imagenes(ruta_carpeta, nuevo_nombre_base, extension_destino='.jpg'):
    """
    Renombra y cambia el formato de todas las imágenes en una carpeta de forma segura.
    Las nuevas imágenes se guardarán en una subcarpeta 'procesadas' para no perder las originales.
    """
    # 1. Crear carpeta de salida
    carpeta_salida = os.path.join(ruta_carpeta, "procesadas")
    if not os.path.exists(carpeta_salida):
        os.makedirs(carpeta_salida)

    # 2. Obtener lista de archivos y ordenarlos (ignorar la carpeta de salida)
    archivos = [f for f in os.listdir(ruta_carpeta) 
                if os.path.isfile(os.path.join(ruta_carpeta, f))]
    archivos.sort() 

    print(f"Procesando {len(archivos)} archivos. Se guardarán en: {carpeta_salida}")

    for i, nombre_original in enumerate(archivos, start=67):
        # Crear el nuevo nombre con ceros a la izquierda (001, 002...)
        nuevo_nombre = f"{nuevo_nombre_base}_{i:03d}{extension_destino}"
        
        ruta_vieja = os.path.join(ruta_carpeta, nombre_original)
        ruta_nueva = os.path.join(carpeta_salida, nuevo_nombre)

        try:
            # Abrir la imagen para cambiar el formato
            with Image.open(ruta_vieja) as img:
                # Convertir a RGB (necesario si pasas de PNG/RGBA/etc a JPG)
                rgb_img = img.convert('RGB')
                rgb_img.save(ruta_nueva)
                
            print(f"✔ {nombre_original} -> {nuevo_nombre}")
        except Exception as e:
            print(f"✘ Error con {nombre_original}: {e}")

# --- CONFIGURACIÓN ---
# Se pueden pasar como argumentos: python renombrar.py <ruta_carpeta> <nombre_base> [formato]
# O usar los valores por defecto hardcodeados.
if len(sys.argv) >= 3:
    mi_ruta = sys.argv[1]
    nombre_deseado = sys.argv[2]
    formato_final = sys.argv[3] if len(sys.argv) >= 4 else '.jpg'
else:
    mi_ruta = r'C:\Users\Jonni\Desktop\Universidad Almeria\Universidad Almeria\TFG\Dataset\Imagenes\v2'
    nombre_deseado = 'recibo_almeria'
    formato_final = '.jpg'

# Ejecutar
if os.path.exists(mi_ruta):
    procesar_imagenes(mi_ruta, nombre_deseado, formato_final)
    print("\n¡Proceso completado con éxito!")
else:
    print(f"La ruta '{mi_ruta}' no existe. Por favor, verifícala.")
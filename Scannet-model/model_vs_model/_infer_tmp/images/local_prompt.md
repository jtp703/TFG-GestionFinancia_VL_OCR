Es posible que un modelo entrenado deepseer_ocr_2 pueda ser desplegado en una Rtx Radeon 6750 xt de forma local?0:26Claude ha respondido: Sí, es posible, pero con limitaciones importantes que conviene tener claras antes de invertir tiempo.Evaluó compatibilidad de hardware AMD y sintetizó soluciones técnicas viablesEvaluó compatibilidad de hardware AMD y sintetizó soluciones técnicas viablesSí, es posible, pero con limitaciones importantes que conviene tener claras antes de invertir tiempo.
Encajar el modelo en la GPU
DeepSeek-OCR-2 son ~3B parámetros y pesa unos 6,7 GB en BF16. Con los 12 GB de la RX 6750 XT cabe perfectamente en BF16/FP16. De hecho, la receta oficial de vLLM indica que una sola GPU con ≥8 GB de VRAM suele ser suficiente para inferencia en BF16. El cuello de botella no es la memoria, sino el ecosistema de software. Unsloth AI + 2
El verdadero problema: AMD + RDNA 2
La 6750 XT (gfx1031) no está oficialmente soportada por ROCm — AMD soporta la 6800 XT (gfx1030) pero deja fuera a la 6700/6750 XT. El truco habitual es hacerla pasar por gfx1030 con HSA_OVERRIDE_GFX_VERSION=10.3.0, y eso funciona razonablemente bien en Linux para Ollama, Stable Diffusion y PyTorch+ROCm. Pero hay dos obstáculos específicos para DeepSeek-OCR-2: DEV Community

El código de inferencia oficial usa flash_attention_2, que no está disponible en ROCm para RDNA 2. Tendrás que cambiar a \_attn_implementation="eager" (más lento, pero funciona).
Como entrenaste con Unsloth+PEFT, lo más limpio es fusionar el LoRA con el modelo base antes de desplegar (model.merge_and_unload() y guardar), para evitar problemas de compatibilidad de PEFT con ROCm.

Camino práctico recomendado

Linux (Ubuntu 22.04/24.04), no Windows. En WSL2 ROCm tiene soporte muy limitado para consumer RDNA 2.
ROCm 6.x + PyTorch ROCm wheels + HSA_OVERRIDE_GFX_VERSION=10.3.0.
Cargar el modelo con transformers y eager attention, en bfloat16.
Fusionar el LoRA previamente.

Alternativas si ROCm te da problemas

CPU: funciona pero será dolorosamente lento para una VLM.
llama.cpp/Vulkan: agnóstico de vendor, pero el soporte para VLMs como DeepSeek-OCR aún es irregular; depende de que alguien haya hecho la conversión a GGUF.
Para tu TFG (Scannet): dado el bajo tráfico esperado, RunPod serverless o un endpoint en HF Inference probablemente te dará menos quebraderos de cabeza que pelearte con ROCm en una 6750 XT — y puedes usar la GPU local solo para desarrollo/pruebas.

¿Estás en Linux o Windows? Eso cambia bastante la viabilidad real.Has dicho: Estoy en windowsEstoy en windows9:27Claude ha respondido: Entonces la respuesta cambia significativamente: en Windows nativo es muy difícil, y para tu caso concreto (TFG con presupuesto cero) probablemente no merece l…Evaluó opciones limitadas de GPU en Windows para despliegue localEvaluó opciones limitadas de GPU en Windows para despliegue localEntonces la respuesta cambia significativamente: en Windows nativo es muy difícil, y para tu caso concreto (TFG con presupuesto cero) probablemente no merece la pena el esfuerzo.
Por qué Windows lo complica todo
El HIP SDK de AMD para Windows cubre casi todas las GPUs RDNA 2 y RDNA 3, excluyendo precisamente el rango RX 6600 a RX 6750 XT. Es decir, tu modelo de GPU está en el agujero específico que AMD no soporta en Windows. No es que sea difícil, es que está explícitamente fuera. Y a corto plazo no parece que vaya a cambiar: AMD ha indicado que la próxima versión mayor de ROCm llegará en la primera mitad de 2026, con versiones menores habilitando targets adicionales cada 6 semanas — pero las RDNA 2 consumer no son prioridad. Tom's HardwareGitHub
Opciones reales en Windows, de más a menos viable

WSL2 + ROCm con override HSA_OVERRIDE_GFX_VERSION=10.3.0. Técnicamente posible, pero el soporte de ROCm en WSL2 para RDNA 2 consumer es muy limitado. Vas a pelearte con drivers, flash-attn no funciona, y probablemente acabes con errores opacos. Días de tinkering, no horas.
torch-directml / ONNX Runtime DirectML. Es la vía "oficial" de Microsoft para usar cualquier GPU DX12 en ML. Funciona para modelos estándar, pero DeepSeek-OCR-2 carga con trust_remote_code=True y un modeling_deepseek_ocr.py personalizado que usa flash_attention_2. Migrar eso a DirectML requiere parchear el código del modelo, y no hay garantía de que todas las operaciones del DeepEncoder estén soportadas. Posible, pero no trivial.
llama.cpp con backend Vulkan. Funciona en Windows con cualquier GPU, pero DeepSeek-OCR-2 es una VLM con encoder visual personalizado (DeepEncoder V2) — el soporte de VLMs exóticas en llama.cpp es irregular. Habría que comprobar si existe conversión GGUF, y dudo mucho que la haya todavía.
Dual boot a Linux (Ubuntu 22.04/24.04). Si quieres realmente desplegar local, este es el camino realista. Con el override gfx1030, BF16, attention en eager y el LoRA fusionado, debería funcionar.

Mi recomendación honesta para tu TFG
Para Scannet, dado el tráfico bajo durante pruebas y presupuesto cero, olvídate del despliegue local en esta máquina y tira por una de estas:

HF Inference Endpoints con cold-start (gratis hasta cierto uso, paga solo cuando hay petición).
RunPod serverless con tu imagen Docker — coincide con lo que ya estabas comparando.
Modal o Replicate si prefieres una experiencia más "serverless" pura.

Reserva la 6750 XT para desarrollo en CPU (que para una imagen suelta y depuración es viable, lento pero usable) y deja la GPU para lo que sí va bien en Windows: el frontend de Next.js y el resto del stack. Pelearte con ROCm en Windows para una 6750 XT te va a robar tiempo que necesitas para el TFG.
¿Quieres que profundice en alguna de las opciones cloud (precios concretos, cold-start, cómo encajaría con tu pipeline actual)?Has dicho: que es esto: ROCm y esto RDNA 2que es esto: ROCm y esto RDNA 29:33Claude ha respondido: Son dos conceptos del mundo AMD que conviene tener claros porque explican por qué tu GPU está en una situación tan incómoda:Preparó explicaciones técnicas accesibles en españolPreparó explicaciones técnicas accesibles en españolSon dos conceptos del mundo AMD que conviene tener claros porque explican por qué tu GPU está en una situación tan incómoda:
RDNA 2 es el nombre de la arquitectura (el diseño interno del chip) que AMD usó en su generación de GPUs lanzada a finales de 2020. Tu RX 6750 XT pertenece a esta familia, junto con todas las demás de la serie RX 6000 (6600, 6700, 6800, 6900...). Es análogo a cómo NVIDIA tiene arquitecturas como "Ampere" (RTX 30xx) o "Ada Lovelace" (RTX 40xx). La sucesora es RDNA 3 (serie RX 7000, lanzada finales de 2022) y luego RDNA 4 (serie RX 9000, 2025). Dentro de RDNA 2 hay variantes identificadas con códigos como gfx1030 (la 6800 XT/6900 XT) o gfx1031 (tu 6750 XT) — esos códigos son los que usa el software para saber qué instrucciones puede ejecutar.
ROCm (Radeon Open Compute) es la plataforma de software de AMD para computación general en GPU, equivalente a lo que CUDA es para NVIDIA. Es el conjunto de drivers, compiladores y librerías que permiten que PyTorch, TensorFlow, etc. usen la GPU para entrenar e inferir modelos en lugar de la CPU. Cuando dices model.cuda() en PyTorch con una GPU AMD, en realidad ROCm está traduciendo eso por debajo para que funcione en hardware AMD. El problema histórico de ROCm — y la razón de tanto dolor de cabeza en hilos de Reddit — es que su soporte es mucho más estrecho que el de CUDA: AMD elige unas pocas GPUs por generación para dar soporte oficial, y el resto se queda fuera o requiere trucos (como el HSA_OVERRIDE_GFX_VERSION que mencioné, que básicamente le miente a ROCm diciéndole "trata esta 6750 XT como si fuera una 6800 XT").
Por qué importa para tu caso: el software de IA está construido asumiendo CUDA. Para que funcione en AMD necesitas ROCm. Y ROCm:

No soporta oficialmente tu chip (gfx1031).
En Windows ni siquiera soporta el rango 6600–6750 XT, ni con trucos.
En Linux puedes hacer que funcione "engañándolo", pero pierdes optimizaciones como flash-attention.

Por eso una GPU NVIDIA de gama equivalente o incluso inferior (una RTX 3060 12GB, por ejemplo) sería mucho más práctica para ML pese a ser teóricamente "peor" para jugar.Has dicho: Mencionas que en linux esto podria ser factible pero dime como de factible.Mencionas que en linux esto podria ser factible pero dime como de factible. Si en windows es un9% de factible como seria linux. Ajusta windows si lo necesitas.9:38Claude ha respondido: Reajustando: Windows nativo lo bajaría a ~5% (HIP SDK explícitamente excluye tu chip, y los caminos alternativos como DirectML requieren parchear código del mo…Calibró probabilidades de viabilidad entre sistemas operativosCalibró probabilidades de viabilidad entre sistemas operativosReajustando: Windows nativo lo bajaría a ~5% (HIP SDK explícitamente excluye tu chip, y los caminos alternativos como DirectML requieren parchear código del modelo). WSL2 estaría sobre un 15% — técnicamente AMD lo lista, pero con RDNA 2 consumer falla más que funciona.
Linux: ~65-75% de factibilidad realista
No es 95% porque tu GPU sigue sin estar oficialmente soportada (gfx1031 no está en la lista de ROCm en ninguna plataforma). Pero la diferencia clave es que en Linux el truco del override sí funciona de forma estable: le dices a ROCm "trata esto como una 6800 XT (gfx1030)" con la variable HSA_OVERRIDE_GFX_VERSION=10.3.0 y la mayoría de cargas de PyTorch corren bien. Hay decenas de reports de gente con tu mismo chip ejecutando Ollama, Stable Diffusion, llama.cpp y modelos de Hugging Face vía transformers.
Qué tendrías que hacer (orden realista de fricción)

Instalar Ubuntu 22.04 o 24.04 (dual boot o sustituir Windows). ROCm es muy quisquilloso con versiones de kernel, así que mejor LTS reciente. Esto te lleva una tarde.
Instalar ROCm vía amdgpu-install con --usecase=rocm,hip. Luego añadir tu usuario a los grupos video y render. Reboot. Verificar con rocminfo que detecta gfx1031. Otra tarde, sin sorpresas si sigues una guía.
PyTorch con ROCm: instalar las wheels de torch con índice ROCm (--index-url https://download.pytorch.org/whl/rocm6.x). Verificar que torch.cuda.is_available() devuelve True (sí, sigue llamándose "cuda" en la API aunque por debajo sea ROCm). Una hora.
El paso crítico — adaptar el código del modelo: DeepSeek-OCR-2 carga con \_attn_implementation='flash_attention_2'. Tienes que cambiarlo a 'eager'. Esto es una línea, pero el código del modelo se descarga con trust_remote_code=True, así que asegúrate de pasarlo como argumento al from_pretrained. Si dentro del modeling_deepseek_ocr.py hay imports duros de flash_attn, hay que comentarlos. Aquí está el riesgo mayor: si el modelo tiene operaciones que ROCm no implementa bien (algunos kernels custom), te puedes encontrar errores opacos. Esta es la incertidumbre que me lleva del 75% al 65%.
Fusionar el LoRA con merge_and_unload() antes de cargar, para evitar capas extra de PEFT que pueden dar problemas.
Ejecutar: con HSA_OVERRIDE_GFX_VERSION=10.3.0 python infer.py. En BF16 deberías estar sobre 7-8 GB de VRAM, dejando margen para imágenes grandes.

Rendimiento esperado si funciona
No esperes nada parecido a una A100. Sin flash-attn y con override, mi estimación es 5-15 segundos por imagen en modo Base (vs <1 s en una A100). Para desarrollo y validación cualitativa, perfectamente usable. Para producción, no.
Cuándo el 65% se convierte en 95%
Si en lugar de tu 6750 XT tuvieras una 6800 XT (gfx1030 nativo, soporte oficial), las complicaciones del override desaparecen y solo te quedan los cambios de atención. Eso sería ~90%.
Mi recomendación matizada
Si esto fuera un proyecto personal a largo plazo, dual-boot a Linux merece la pena — aprendes mucho y desbloqueas todo el ecosistema ML local. Pero para tu TFG con plazos, el ROI no compensa: vas a quemar 1-2 fines de semana en setup y debugging que no aportan nada al texto del TFG ni a la nota. El despliegue serverless en RunPod (que ya conocías) te da el mismo modelo funcionando en 30 minutos.
¿Tienes margen real de tiempo o vas justo con el TFG?

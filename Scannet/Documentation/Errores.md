# Error en vercel dev

Error: supabaseUrl is required.
Error: An unexpected error occurred!
Error: Command failed: taskkill /pid 22352 /T /F
ERROR: no se encontró el proceso "22352".

    at genericNodeError (node:internal/errors:984:15)
    at wrappedFn (node:internal/errors:538:14)
    at ChildProcess.exithandler (node:child_process:422:12)
    at ChildProcess.emit (node:events:519:28)
    at maybeClose (node:internal/child_process:1105:16)
    at ChildProcess._handle.onexit (node:internal/child_process:305:5)

# Errores network

Request URL
https://tjqkmpekplytdzdcvebc.supabase.co/rest/v1/ticket?select=id&usuario_id=eq.53fa5c1d-80ea-4ef3-81d7-dccf838eedd6&comercio=eq.MERCADONA%2C+S.A.&fecha=eq.2025-03-15&total=eq.17.55&limit=1
Request method
GET
Status code
400 Bad Request
Remote address
104.18.38.10:443
Referrer policy
strict-origin-when-cross-origin
Request URL
http://localhost:5173/api/categorize

Request method
POST
Status code
500 Internal Server Error
Remote address
[::1]:5173
Referrer policy
strict-origin-when-cross-origin

Request URL
https://tjqkmpekplytdzdcvebc.supabase.co/storage/v1/object/tickets/53fa5c1d-80ea-4ef3-81d7-dccf838eedd6/1774790599245.jpg
Request method
POST
Status code
400 Bad Request
Remote address
104.18.38.10:443
Referrer policy
strict-origin-when-cross-origin

#errores consola
see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.
warnOnce @ react-router-dom.js?v=fc04e48e:4436
logDeprecation @ react-router-dom.js?v=fc04e48e:4439
logV6DeprecationWarnings @ react-router-dom.js?v=fc04e48e:4445
(anonymous) @ react-router-dom.js?v=fc04e48e:5314
commitHookEffectListMount @ chunk-PJEEZAML.js?v=fc04e48e:16915
commitPassiveMountOnFiber @ chunk-PJEEZAML.js?v=fc04e48e:18156
commitPassiveMountEffects_complete @ chunk-PJEEZAML.js?v=fc04e48e:18129
commitPassiveMountEffects_begin @ chunk-PJEEZAML.js?v=fc04e48e:18119
commitPassiveMountEffects @ chunk-PJEEZAML.js?v=fc04e48e:18109
flushPassiveEffectsImpl @ chunk-PJEEZAML.js?v=fc04e48e:19490
flushPassiveEffects @ chunk-PJEEZAML.js?v=fc04e48e:19447
(anonymous) @ chunk-PJEEZAML.js?v=fc04e48e:19328
workLoop @ chunk-PJEEZAML.js?v=fc04e48e:197
flushWork @ chunk-PJEEZAML.js?v=fc04e48e:176
performWorkUntilDeadline @ chunk-PJEEZAML.js?v=fc04e48e:384Understand this warning
@supabase_supabase-js.js?v=fc04e48e:19251 GET https://tjqkmpekplytdzdcvebc.supabase.co/rest/v1/ticket?select=id&usuario_id=eq.53fa5c1d-80ea-4ef3-81d7-dccf838eedd6&comercio=eq.MERCADONA%2C+S.A.&fecha=eq.2025-03-15&total=eq.17.55&limit=1 400 (Bad Request)
(anonymous) @ @supabase_supabase-js.js?v=fc04e48e:19251
(anonymous) @ @supabase_supabase-js.js?v=fc04e48e:19265
await in (anonymous)
then @ @supabase_supabase-js.js?v=fc04e48e:458Understand this error
useScan.ts:170 POST http://localhost:5173/api/categorize 500 (Internal Server Error)
guardar @ useScan.ts:170
await in guardar
handleConfirmar @ VerifyForm.tsx:37
callCallback2 @ chunk-PJEEZAML.js?v=fc04e48e:3674
invokeGuardedCallbackDev @ chunk-PJEEZAML.js?v=fc04e48e:3699
invokeGuardedCallback @ chunk-PJEEZAML.js?v=fc04e48e:3733
invokeGuardedCallbackAndCatchFirstError @ chunk-PJEEZAML.js?v=fc04e48e:3736
executeDispatch @ chunk-PJEEZAML.js?v=fc04e48e:7014
processDispatchQueueItemsInOrder @ chunk-PJEEZAML.js?v=fc04e48e:7034
processDispatchQueue @ chunk-PJEEZAML.js?v=fc04e48e:7043
dispatchEventsForPlugins @ chunk-PJEEZAML.js?v=fc04e48e:7051
(anonymous) @ chunk-PJEEZAML.js?v=fc04e48e:7174
batchedUpdates$1 @ chunk-PJEEZAML.js?v=fc04e48e:18913
batchedUpdates @ chunk-PJEEZAML.js?v=fc04e48e:3579
dispatchEventForPluginEventSystem @ chunk-PJEEZAML.js?v=fc04e48e:7173
dispatchEventWithEnableCapturePhaseSelectiveHydrationWithoutDiscreteEventReplay @ chunk-PJEEZAML.js?v=fc04e48e:5478
dispatchEvent @ chunk-PJEEZAML.js?v=fc04e48e:5472
dispatchDiscreteEvent @ chunk-PJEEZAML.js?v=fc04e48e:5449Understand this error
useScan.ts:120 POST https://tjqkmpekplytdzdcvebc.supabase.co/storage/v1/object/tickets/53fa5c1d-80ea-4ef3-81d7-dccf838eedd6/1774790599245.jpg 400 (Bad Request)

// app/comida/escanear.tsx
//
// El escaner de codigos ahora es el modo Codigo de la camara de la app
// (app/comida/camara.tsx). Esta ruta queda para no romper links viejos y
// redirige alla, para que no haya dos camaras.

import { Redirect, useLocalSearchParams } from 'expo-router';

export default function Escanear() {
  const { tipo } = useLocalSearchParams<{ tipo?: string }>();
  return (
    <Redirect href={{ pathname: '/comida/camara', params: { modo: 'codigo', ...(tipo ? { tipo } : {}) } }} />
  );
}

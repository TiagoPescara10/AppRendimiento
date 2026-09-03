import  { useEffect, useState } from 'react';
import { obtenerPerfilLocal } from '@/db/queries/perfil';
import type { PerfilRow } from '@/db/schema';

export function useOnboarding() {
  const [perfil, setPerfil] = useState<PerfilRow | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    obtenerPerfilLocal()
      .then((p) => { if (vivo) setPerfil(p); })
      .catch(console.error)
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, []);

  return { perfil, cargando };
}
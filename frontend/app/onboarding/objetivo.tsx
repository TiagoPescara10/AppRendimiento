import { Alert } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { useOnboarding } from '@/features/perfil/hooks/useOnboarding';
import { PasoOnboarding } from '@/features/perfil/components/PasoOnboarding';
import { ListaOpciones } from '@/ui/ListaOpciones';
import { ultimoPeso } from '@/db/queries/peso';
import { useRouter } from 'expo-router';
import type { Objetivo as TipoObjetivo } from '@/db/schema';
import { actualizarPerfil } from '@/db/queries/perfil';
import { Input } from '@/ui/Input';


export default function Objetivo() {
  const router = useRouter();
  const { perfil, cargando } = useOnboarding();
  const [objetivo, setObjetivo] = useState<TipoObjetivo | null>(null);
  const [objetivoKgTexto, setObjetivoKgTexto] = useState('');
  const [ultimoPesoValue, setUltimoPesoValue] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);
  const guardandoRef = useRef(false);

  useEffect(() => {
    const fetchUltimoPeso = async () => {
      if (perfil) {
        const ultimo = await ultimoPeso(perfil.id);
        setUltimoPesoValue(ultimo?.peso_kg || null);
      }
    };

    fetchUltimoPeso();
  }, [perfil]);
  
    //Funcion para ver si los datos dan un correcto IMC
    const objetivoKg = parseFloat(objetivoKgTexto.replace(',', '.'));
    const alturaM = (perfil?.altura_cm ?? 0) / 100;
    const imc = objetivoKg / (alturaM ** 2);
    const requierePesoObjetivo = objetivo === 'bajar' || objetivo === 'subir';


    const opciones: { valor: TipoObjetivo; titulo: string; descripcion: string }[] = [
    {
        valor: 'bajar',
        titulo: 'Bajar de peso',
        descripcion: 'Reducir grasa corporal de forma gradual',
    },
    {
        valor: 'mantener',
        titulo: 'Mantener peso',
        descripcion: 'Sostener tu peso actual y comer mejor',
    },
    {
        valor: 'subir',
        titulo: 'Subir de peso',
        descripcion: 'Ganar masa muscular con superávit calórico',
    },
    {
        valor: 'rendimiento',
        titulo: 'Mejorar rendimiento',
        descripcion: 'Comer para entrenar y competir mejor, sin foco en la balanza',
    },
    ];

  const handleGuardar = async () => {
    if (guardandoRef.current) return;

    if (!objetivo) {
      Alert.alert('Por favor, seleccioná un objetivo.');
      return;
    }
    if (!perfil) {
      Alert.alert('Perfil no encontrado. Por favor, completá tus datos personales primero.');
      router.replace('/onboarding/datos');
      return;
    }

    if (requierePesoObjetivo) {
        if (!Number.isFinite(objetivoKg)) {
            Alert.alert('Falta el peso objetivo', 'Ingresá el peso al que querés llegar.');
            return;
        }
        if (!perfil.altura_cm) {
            Alert.alert('Falta la altura', 'Volvé al primer paso y completá tu altura.');
            return;
        }
        if (imc < 18.5) {
            Alert.alert('Objetivo no saludable', 'Ese peso queda por debajo del rango saludable para tu altura.');
            return;
        }
        if (ultimoPesoValue !== null) {
            if (objetivo === 'bajar' && objetivoKg >= ultimoPesoValue) {
                Alert.alert('Revisá el objetivo', `Elegiste bajar de peso, pero el objetivo es mayor o igual a tu peso actual (${ultimoPesoValue} kg).`);
                return;
            }
            if (objetivo === 'subir' && objetivoKg <= ultimoPesoValue) {
                Alert.alert('Revisá el objetivo', `Elegiste subir de peso, pero el objetivo es menor o igual a tu peso actual (${ultimoPesoValue} kg).`);
                return;
            }
            }
    }

    guardandoRef.current = true;
    setGuardando(true);
    
    try {
      // Guardar el objetivo en la base de datos o en el estado global
      // Aquí deberías implementar la lógica para guardar el objetivo seleccionado y el peso objetivo si aplica.
      // Por ejemplo, podrías llamar a una función que actualice el perfil del usuario en la base de datos.
      await actualizarPerfil(perfil.id, {
        objetivo: objetivo,
        peso_objetivo_kg: requierePesoObjetivo ? objetivoKg : null,
      });
      router.push('/onboarding/resumen');
    } catch (error) {
      console.error('Error al guardar el objetivo:', error);
      Alert.alert('Error', 'No se pudo guardar la información. Por favor, intentá nuevamente.');
    } finally {
      guardandoRef.current = false;
      setGuardando(false);
    }
  };

  return (
    <PasoOnboarding
      paso={4}
      totalPasos={5}
        titulo={
            perfil?.nombre
                ? `${perfil.nombre}, ¿Cuál es tu objetivo?`
                : '¿Cuál es tu objetivo?'
            }
      onSiguiente={handleGuardar}
      puedeSeguir={!!objetivo && (!requierePesoObjetivo || !!objetivoKgTexto) && !cargando}
      guardando={guardando}
    >
      <ListaOpciones
        opciones={opciones}
        valor={objetivo}
        onChange={setObjetivo}
      />
      {requierePesoObjetivo && (
        <Input
          label="Peso objetivo (kg)"
          value={objetivoKgTexto}
          onChangeText={setObjetivoKgTexto}
          keyboardType="decimal-pad"
          placeholder="Ej: 70"
        />
      )}
    </PasoOnboarding>
  );
}
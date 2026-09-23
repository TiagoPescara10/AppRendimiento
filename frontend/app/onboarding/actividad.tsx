import {Alert } from 'react-native';
import { useOnboarding } from '@/features/perfil/hooks/useOnboarding';
import { useRouter } from 'expo-router';
import { useState, useRef, useEffect } from 'react';
import { actualizarPerfil } from '@/db/queries/perfil';
import { PasoOnboarding } from '@/features/perfil/components/PasoOnboarding';
import { NivelActividad } from '@/db/schema';
import { ListaOpciones } from '@/ui/ListaOpciones';
import { Input } from '@/ui/Input';
import { capitalizarDeporte } from '@/features/agenda/formato';

export default function Actividad() {
    const router = useRouter();
    const { perfil, cargando } = useOnboarding();
    const [guardando, setGuardando] = useState(false);
    const [nivel, setNivel] = useState<NivelActividad | null>(null);
    const [deporte, setDeporte] = useState('');

    const guardandoRef = useRef(false);


    useEffect(() => {
    if (perfil) {
        setNivel(perfil.nivel_actividad);
        setDeporte(perfil.deporte_principal ?? '');
    }
    }, [perfil]);
    
    const guardar = async () => {
        if (guardandoRef.current) return;
        if (!nivel) {
            Alert.alert('Faltan datos', 'Seleccioná tu nivel de actividad.');
            return;
        }
        if (!perfil) {                                    // ← este falta
            Alert.alert('Falta un paso', 'Completá primero tus datos personales.');
            router.replace('/onboarding/datos');
            return;
        }
         guardandoRef.current = true;
         setGuardando(true);

        // Guardar en la base de datos
          try {
            await actualizarPerfil(perfil.id, {
            nivel_actividad: nivel,
            deporte_principal: deporte.trim() ? capitalizarDeporte(deporte) : null,
            });
            router.push('/onboarding/objetivo');
        } catch (error) {
            console.error('Error al guardar el perfil:', error);
            Alert.alert('Error', 'No se pudo guardar la información. Por favor, intentá nuevamente.');
        } finally {
            guardandoRef.current = false;
            setGuardando(false);
        }
        };

    return (
        <PasoOnboarding
            paso={4}
            totalPasos={6}
            titulo={
                perfil?.nombre
                    ? `${perfil.nombre}, ¿Cuál es tu nivel de actividad?.`
                    : '¿Cuál es tu nivel de actividad?'
                }
            onSiguiente={guardar}
            puedeSeguir={!!nivel && !cargando}
            guardando={guardando}
        >
            <ListaOpciones
            opciones={[
                { valor: 'sedentario', titulo: 'Sedentario', descripcion: 'Trabajo de oficina, poco movimiento' },
                { valor: 'ligero', titulo: 'Ligero', descripcion: 'Ejercicio 1-2 días por semana' },
                { valor: 'moderado', titulo: 'Moderado', descripcion: 'Ejercicio 3-5 días por semana' },
                { valor: 'alto', titulo: 'Alto', descripcion: 'Ejercicio 6-7 días por semana' },
                { valor: 'muy_alto', titulo: 'Muy alto', descripcion: 'Entrenamiento intenso o trabajo físico' },
            ]}
            valor={nivel}
            onChange={setNivel}
            />
            <Input
                label="Deporte principal (opcional)"
                placeholder="Ej: fútbol, natación, running..."
                value={deporte}
                onChangeText={setDeporte}
            />
        </PasoOnboarding>
    );

    };


// app/(tabs)/index.tsx
//
// Pantalla de pruebas. Todo hardcodeado a proposito.
// El objetivo es VER los tokens en el celular, no que este bien escrita.

import { ScrollView, View, Text, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '@/ui/Card';
import { Boton } from '@/ui/Boton';
import { colors, spacing, fontSize, lineHeight, radius } from '@/ui/theme';
import { Input } from '@/ui/Input';
import { FechaHoy } from '@/ui/FechaHoy';
import { ListaOpciones } from '@/ui/ListaOpciones';
import { Progreso } from '@/ui/Progreso';
import { useState } from 'react';
import { router } from 'expo-router';
import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { cerrarDb, NOMBRE_DB } from '@/db/schema';

export default function Prueba() {
  const dirigir = () => {
    router.push('/registro');
  }
  const resetear = async () => {
    try {
      await cerrarDb();
      await SQLite.deleteDatabaseAsync(NOMBRE_DB);
    } catch (e) {
      // Si no existe, ya esta borrada. No es un error real.
      console.log('Base ya borrada o inexistente');
    }
    await AsyncStorage.clear();
    Alert.alert('Listo', 'Recargá la app (sacudí el teléfono → Reload).');
  };
  const [nivel, setNivel] = useState<'sedentario' | 'ligero' | 'moderado' | null>(null);
  return (
    <SafeAreaView style={estilos.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={estilos.scroll}
        showsVerticalScrollIndicator={false}
      >
        <FechaHoy />
        <Text style={estilos.saludo}>Hola, Tiago</Text>

        {/* Card 1 — el numero grande y las barras de macros */}
        <Card style={estilos.espacio}>
          <Text style={estilos.label}>Te quedan</Text>
          <View style={estilos.filaNumero}>
            <Text style={estilos.numeroGrande}>1.240</Text>
            <Text style={estilos.unidad}>kcal</Text>
          </View>

          <View style={estilos.filaMacros}>
            <Barra nombre="Proteína 78g" pct={0.62} color={colors.protein} />
            <Barra nombre="Carbos 140g" pct={0.44} color={colors.carbs} />
            <Barra nombre="Grasa 52g" pct={0.71} color={colors.fat} />
          </View>
        </Card>

        {/* Aviso — fondo suave, sin borde */}
        <View style={[estilos.aviso, estilos.espacio]}>
          <Text style={estilos.avisoTitulo}>Partido en 3 h 40 min</Text>
          <Text style={estilos.avisoTexto}>
            Buen momento para una comida completa: arroz, pollo y poca grasa.
          </Text>
        </View>

        {/* Dos cards lado a lado */}
        <View style={[estilos.dosColumnas, estilos.espacio]}>
          <Card style={estilos.mitad}>
            <Text style={estilos.label}>Sueño</Text>
            <Text style={estilos.valorMedio}>6h 20m</Text>
          </Card>
          <Card style={estilos.mitad}>
            <Text style={estilos.label}>Energía</Text>
            <Text style={[estilos.valorMedio, { color: colors.warning }]}>
              3 / 5
            </Text>
          </Card>
        </View>

        <Text style={estilos.seccion}>Comidas de hoy</Text>
        <View style={estilos.espacio}>
          <Boton titulo="Ir a registro" onPress={dirigir} ancho />
        </View>

        {/* Card sin padding, para que las filas toquen el borde */}
        <Card style={[estilos.espacio, { padding: 0 }]}>
          <Fila titulo="Desayuno" sub="Avena, banana, café" valor="420" />
          <Fila titulo="Almuerzo" sub="Milanesa con puré" valor="740" />
          <Fila titulo="Merienda" sub="" valor="—" ultima />
        </Card>

        {/* Los tres botones juntos, para comparar */}
        <Boton titulo="Registrar comida" onPress={() => {}} ancho />
        <View style={{ height: spacing.sm }} />
        <Boton titulo="Secundario" variante="secundario" onPress={() => {}} ancho />
        <View style={{ height: spacing.sm }} />
        <Boton titulo="Cargando" cargando onPress={() => {}} ancho />

        <Boton titulo="Resetear todo" onPress={resetear} />
        
        
        <Input label="Peso" placeholder="72,5" keyboardType="decimal-pad" style={{ marginBottom: spacing.md }} />
        <Input label="Buscar comida" placeholder="Ej: milanesa" />
        <Progreso actual={3} total={5} style={{ marginTop: spacing.md }} />
        <ListaOpciones
          valor={nivel}
          onChange={setNivel}
          opciones={[
            { valor: 'sedentario', titulo: 'Sedentario', descripcion: 'Poco o nada de ejercicio' },
            { valor: 'ligero', titulo: 'Ligero', descripcion: 'Ejercicio 1-3 días por semana' },
            { valor: 'moderado', titulo: 'Moderado', descripcion: 'Ejercicio 3-5 días por semana' },
          ]}
        />
        <Boton titulo="Ir a onboarding" onPress={() => router.push('/onboarding/datos')} />
      </ScrollView>
    </SafeAreaView>
  );
} 

// Helpers locales. Cuando los repitas en otra pantalla, ahi los sacas a src/ui/.
function Barra({
  nombre,
  pct,
  color,
}: {
  nombre: string;
  pct: number;
  color: string;
}) {
  return (
    <View style={{ flex: 1 }}>
      <View style={estilos.barraFondo}>
        <View
          style={{
            width: `${Math.round(pct * 100)}%`,
            height: '100%',
            backgroundColor: color,
          }}
        />
      </View>
      <Text style={estilos.barraLabel}>{nombre}</Text>
    </View>
  );
}

function Fila({
  titulo,
  sub,
  valor,
  ultima,
}: {
  titulo: string;
  sub: string;
  valor: string;
  ultima?: boolean;
}) {
  return (
    <View style={[estilos.fila, !ultima && estilos.filaBorde]}>
      <View style={{ flex: 1 }}>
        <Text style={estilos.filaTitulo}>{titulo}</Text>
        {sub ? <Text style={estilos.filaSub}>{sub}</Text> : null}
      </View>
      <Text style={estilos.filaValor}>{valor}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl },

  espacio: { marginBottom: spacing.md },

  fecha: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.textSecondary,
  },
  saludo: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
    fontWeight: '500',
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  seccion: {
    fontSize: fontSize.small,
    fontWeight: '500',
    color: colors.textPrimary,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },

  label: {
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    color: colors.textSecondary,
  },
  filaNumero: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  numeroGrande: {
    fontSize: fontSize.display,
    lineHeight: lineHeight.display,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  unidad: { fontSize: fontSize.body, color: colors.textSecondary },
  valorMedio: {
    fontSize: fontSize.subtitle,
    lineHeight: lineHeight.subtitle,
    fontWeight: '500',
    color: colors.textPrimary,
  },

  filaMacros: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  barraFondo: {
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  barraLabel: { fontSize: 11, color: colors.textSecondary },

  aviso: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  avisoTitulo: {
    fontSize: fontSize.caption,
    fontWeight: '500',
    color: colors.textOnAccentSoft,
    marginBottom: spacing.xs,
  },
  avisoTexto: {
    fontSize: fontSize.small,
    lineHeight: lineHeight.small,
    color: colors.accentPressed,
  },

  dosColumnas: { flexDirection: 'row', gap: spacing.md },
  mitad: { flex: 1 },

  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  filaBorde: { borderBottomWidth: 0.5, borderBottomColor: colors.border },
  filaTitulo: { fontSize: fontSize.small, color: colors.textPrimary },
  filaSub: { fontSize: fontSize.caption, color: colors.textMuted },
  filaValor: { fontSize: fontSize.small, color: colors.textSecondary },
});
// Unico punto de acceso a la sesion. Hoy usa AsyncStorage porque no hay
// backend; cuando lo haya, esto pasa a expo-secure-store y el resto de la
// app no se entera.

import AsyncStorage from '@react-native-async-storage/async-storage';

const CLAVE = 'sesion';

export interface Sesion {
  email: string;
}

export async function guardarSesion(datos: Sesion): Promise<void> {
  await AsyncStorage.setItem(CLAVE, JSON.stringify(datos));
}

export async function obtenerSesion(): Promise<Sesion | null> {
  const crudo = await AsyncStorage.getItem(CLAVE);
  if (!crudo) return null;
  try {
    return JSON.parse(crudo) as Sesion;
  } catch {
    // JSON roto: tratarlo como sin sesion en vez de tirar.
    return null;
  }
}

export async function cerrarSesion(): Promise<void> {
  await AsyncStorage.removeItem(CLAVE);
}
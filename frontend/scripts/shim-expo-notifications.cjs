// Implementa la superficie de expo-notifications que usa
// src/features/avisos/sincronizar.ts, en memoria. Sirve para probar la
// sincronizacion en Node.
//
// `__estado` queda expuesto para las pruebas: cuantas corridas hubo (cada
// corrida lee las programadas una vez), que hay programado y si el permiso
// esta dado o tiene que fallar.

const estado = {
  programadas: new Map(),
  corridas: 0,
  permiso: true,
  fallarPermiso: false,
};

module.exports = {
  __estado: estado,

  SchedulableTriggerInputTypes: { DATE: 'date' },

  async getPermissionsAsync() {
    if (estado.fallarPermiso) throw new Error('falla simulada de getPermissionsAsync');
    return {
      granted: estado.permiso,
      canAskAgain: true,
      status: estado.permiso ? 'granted' : 'undetermined',
      expires: 'never',
    };
  },

  async getAllScheduledNotificationsAsync() {
    estado.corridas++;
    return [...estado.programadas.values()];
  },

  async cancelScheduledNotificationAsync(id) {
    estado.programadas.delete(id);
  },

  async scheduleNotificationAsync(req) {
    const id = req.identifier;
    estado.programadas.set(id, { identifier: id, content: req.content, trigger: req.trigger });
    return id;
  },
};

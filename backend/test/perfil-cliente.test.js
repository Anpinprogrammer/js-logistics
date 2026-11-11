import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, reiniciarBase, crearCuenta, sesion, CLAVE } from './ayuda.js';

let cliente, otro, oficina, idCliente, idOtro;

before(async () => {
  await reiniciarBase();
  await crearCuenta({ email: 'oficina@js.co', rol: 'asistente' });
  oficina = await sesion('oficina@js.co');
  idCliente = (await oficina.post('/api/clientes').send({ nombre: 'Tienda Uno', telefono: '3001234567', tarifa: 8000 })).body.cliente.id;
  idOtro = (await oficina.post('/api/clientes').send({ nombre: 'Tienda Dos', telefono: '3111234567', tarifa: 9000 })).body.cliente.id;
  await crearCuenta({ email: 'uno@js.co', rol: 'cliente', clienteId: idCliente });
  await crearCuenta({ email: 'dos@js.co', rol: 'cliente', clienteId: idOtro });
  cliente = await sesion('uno@js.co');
  otro = await sesion('dos@js.co');
});
after(() => pool.end());

test('el cliente actualiza solo su nombre, teléfono y dirección; conserva la tarifa', async () => {
  const r = await cliente.patch('/api/clientes/mi-perfil').send({ nombre: 'Tienda Uno Nueva', telefono: '+57 300 123 4567', direccionRecogida: 'Calle 1 # 2-3, Cali' });
  assert.equal(r.status, 200);
  assert.equal(r.body.cliente.nombre, 'Tienda Uno Nueva');
  assert.equal(r.body.cliente.direccionRecogida, 'Calle 1 # 2-3, Cali');
  assert.equal(r.body.cliente.tarifa, 8000);
  assert.equal((await otro.get(`/api/clientes/${idOtro}`)).body.cliente.nombre, 'Tienda Dos');
  assert.equal((await cliente.get(`/api/clientes/${idOtro}`)).status, 403);
  assert.equal((await cliente.patch(`/api/clientes/${idOtro}`).send({ nombre: 'No permitido' })).status, 403);
  assert.equal((await cliente.patch('/api/clientes/mi-perfil').send({ tarifa: 0 })).status, 400);
});

test('cambiar el correo exige la contraseña actual y no permite duplicados', async () => {
  assert.equal((await cliente.patch('/api/clientes/mi-perfil').send({ email: 'nuevo@js.co' })).status, 400);
  assert.equal((await cliente.patch('/api/clientes/mi-perfil').send({ email: 'nuevo@js.co', claveActual: 'incorrecta' })).status, 400);
  const duplicado = await cliente.patch('/api/clientes/mi-perfil').send({ email: 'dos@js.co', claveActual: CLAVE });
  assert.equal(duplicado.status, 409);
  assert.equal(duplicado.body.error.code, 'CORREO_EN_USO');
  const r = await cliente.patch('/api/clientes/mi-perfil').send({ email: 'nuevo@js.co', claveActual: CLAVE });
  assert.equal(r.status, 200);
  assert.equal((await cliente.get('/api/auth/yo')).body.usuario.email, 'nuevo@js.co');
});

test('oficina no puede usar el perfil personal del cliente', async () => {
  assert.equal((await oficina.patch('/api/clientes/mi-perfil').send({ nombre: 'X' })).status, 403);
});

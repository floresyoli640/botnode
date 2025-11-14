// ============================
//  BACK4APP CONFIG
// ============================
const Parse = require('parse/node');
Parse.initialize("Yo7aFmDqSDkWaUhdG4INURZzRQ0qIYNJohfBFajJ", "Sqmmtd0qegDYFAEyPW0phkHYw3aMFlAMCKDrEiQP");
Parse.serverURL = "https://parseapi.back4app.com/";

// ============================
//  WHATSAPP + EXPRESS
// ============================
const express = require('express');
const QRCode = require('qrcode');

const { Client, LocalAuth } = require('whatsapp-web.js');

const app = express();
let qrImage = null;

// Cliente WhatsApp preparado para funcionar en Railway
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ],
        headless: true
    }
});

// Mostrar QR en /qr
client.on('qr', async (qr) => {
    console.log("QR generado. Ábrelo en /qr");
    qrImage = await QRCode.toDataURL(qr);
});

// Cliente listo
client.on('ready', () => {
    console.log('✅ WhatsApp conectado y listo');
});

// Ruta para mostrar QR como imagen
app.get('/qr', (req, res) => {
    if (!qrImage) return res.send("<h2>⏳ Generando QR... espera 5 segundos y actualiza</h2>");
    res.send(`
        <h1>Escanea este QR con WhatsApp</h1>
        <img src="${qrImage}" style="width: 300px;"/>
    `);
});

// Iniciar servidor QR
app.listen(process.env.PORT || 3000, () => {
    console.log("Servidor Express activo para ver el QR");
});

// ============================
//  FUNCIONES DE BACK4APP
// ============================

async function buscarEmpleadoPorNumero(numero) {
    const Employees = Parse.Object.extend("Employees");
    const query = new Parse.Query(Employees);
    query.equalTo("telefono", numero);
    query.include("empresa");
    return await query.first();
}

async function guardarFichajeEnBack4app({ nombre, dni, numero, empresa, accion, latitud, longitud }) {
    const TimeEntry = Parse.Object.extend("TimeEntries");
    const entry = new TimeEntry();

    entry.set("nombre", nombre);
    entry.set("dni", dni);
    entry.set("numero", numero);
    entry.set("accion", accion);
    entry.set("fecha", new Date());

    // --- Pointer seguro ---
    if (empresa && empresa.id) {
        const Companies = Parse.Object.extend("Companies");
        const pointer = new Companies();
        pointer.id = empresa.id;
        entry.set("empresa", pointer);
    }

    if (latitud && longitud) {
        entry.set("ubicacion", new Parse.GeoPoint({ latitude: latitud, longitude: longitud }));
    }

    try {
        await entry.save();
        console.log("Fichaje guardado en Back4app");
    } catch (error) {
        console.error("Error guardando fichaje:", error);
    }
}

// ============================
//  LÓGICA DE FICHAJE
// ============================

const waitingForLocation = new Map();

client.on('message', async msg => {
    console.log('Mensaje recibido:', msg.body);

    const numero = msg.from.replace('@c.us', '');
    const texto = msg.body.trim().toUpperCase();

    // Si el usuario está enviando la ubicación
    if (waitingForLocation.has(numero) && msg.location) {
        const { accion, empleado } = waitingForLocation.get(numero);
        waitingForLocation.delete(numero);

        const nombre = empleado.get("nombre") || "-";
        const dni = empleado.get("dni") || "-";
        const empresa = empleado.get("empresa");
        const latitud = msg.location.latitude;
        const longitud = msg.location.longitude;

        await guardarFichajeEnBack4app({ nombre, dni, numero, empresa, accion, latitud, longitud });

        msg.reply(`✅ Fichaje de ${accion} registrado para ${nombre} a las ${new Date().toLocaleTimeString()}.`);
        return;
    }

    // Comandos ENTRADA / SALIDA
    if (texto === 'ENTRADA' || texto === 'SALIDA') {
        try {
            const empleado = await buscarEmpleadoPorNumero(numero);

            if (empleado) {
                waitingForLocation.set(numero, { accion: texto, empleado });
                msg.reply('📍 Comparte tu ubicación para completar el fichaje.\nUsa el clip ➜ Ubicación.');
            } else {
                msg.reply('❌ Tu número no está autorizado para fichar.');
            }

        } catch (err) {
            console.error(err);
            msg.reply('❌ Error buscando tus datos.');
        }
        return;
    }

    // Si está esperando ubicación
    if (waitingForLocation.has(numero)) {
        msg.reply('⚠️ Aún espero tu ubicación. Usa el icono del clip ➜ Ubicación.');
        return;
    }

    // Respuesta genérica
    msg.reply('Envía "ENTRADA" o "SALIDA" para fichar.');
});

// Inicializar WhatsApp
client.initialize();







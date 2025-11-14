const Parse = require('parse/node');
Parse.initialize("Yo7aFmDqSDkWaUhdG4INURZzRQ0qIYNJohfBFajJ", "Sqmmtd0qegDYFAEyPW0phkHYw3aMFlAMCKDrEiQP");
Parse.serverURL = "https://parseapi.back4app.com/";

const express = require('express');
const qrcode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');

let qrActual = "";

// =============================
// SERVIDOR WEB (VER QR EN RAILWAY)
// =============================
const app = express();

app.get('/qr', (req, res) => {
    if (!qrActual) return res.send("QR aún no generado...");
    res.send(`
        <h1>Escanea este QR</h1>
        <img src="${qrActual}" width="350">
    `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Servidor QR iniciado en puerto", PORT));


// =============================
// CONFIGURACIÓN WHATSAPP
// =============================
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
    }
});

client.on('qr', async qr => {
    console.log("Nuevo QR generado");
    qrActual = await qrcode.toDataURL(qr); // QR en imagen para /qr
});

client.on('ready', () => {
    console.log("WhatsApp conectado y funcionando");
});


// =============================
// BACK4APP
// =============================
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

    if (empresa) entry.set("empresa", empresa);

    if (latitud && longitud) {
        entry.set("ubicacion", new Parse.GeoPoint({
            latitude: latitud,
            longitude: longitud
        }));
    }

    await entry.save();
    console.log("Fichaje guardado en Back4App");
}


// =============================
// LOGICA PRINCIPAL DEL BOT
// =============================
const esperandoUbicacion = new Map();

client.on('message', async msg => {
    const numero = msg.from.replace('@c.us', '');
    const texto = msg.body.trim().toUpperCase();

    // Si estamos esperando la ubicación
    if (esperandoUbicacion.has(numero) && msg.location) {
        const { accion, empleado } = esperandoUbicacion.get(numero);
        esperandoUbicacion.delete(numero);

        await guardarFichajeEnBack4app({
            nombre: empleado.get("nombre"),
            dni: empleado.get("dni"),
            numero,
            empresa: empleado.get("empresa"),
            accion,
            latitud: msg.location.latitude,
            longitud: msg.location.longitude
        });

        msg.reply(`Fichaje de ${accion} registrado correctamente.`);
        return;
    }

    // Procesar ENTRADA/SALIDA
    if (texto === "ENTRADA" || texto === "SALIDA") {
        const empleado = await buscarEmpleadoPorNumero(numero);

        if (!empleado) {
            msg.reply("❌ Tu número no está autorizado para fichar.");
            return;
        }

        esperandoUbicacion.set(numero, { accion: texto, empleado });
        msg.reply("📍 Envíame tu ubicación para completar el fichaje.");
        return;
    }

    msg.reply(`Envía "ENTRADA" o "SALIDA" para fichar.`);
});

client.initialize();












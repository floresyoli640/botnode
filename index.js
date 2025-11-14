const Parse = require('parse/node');
Parse.initialize("Yo7aFmDqSDkWaUhdG4INURZzRQ0qIYNJohfBFajJ", "Sqmmtd0qegDYFAEyPW0phkHYw3aMFlAMCKDrEiQP");
Parse.serverURL = "https://parseapi.back4app.com/";

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const express = require('express');

let qrActual = ""; // Para almacenar el QR y mostrarlo en la web

// ---------- SERVIDOR WEB PARA VER QR ----------
const app = express();
app.get('/qr', (req, res) => {
    if (!qrActual) return res.send("QR aún no generado...");
    res.send(`
        <h1>Escanea este código QR</h1>
        <img src="${qrActual}" style="width:300px;">
    `);
});

// Railway asigna puerto automáticamente
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Servidor QR web activo en puerto", PORT));


// ---------- WHATSAPP ----------
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', async qr => {
    console.log("Nuevo QR generado!");

    // Convertir el QR a imagen
    qrActual = await qrcode.toDataURL(qr);
});

client.on('ready', () => {
    console.log("WhatsApp listo");
});


// ---------- BACK4APP ----------
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
        entry.set("ubicacion", new Parse.GeoPoint({ latitude: latitud, longitude: longitud }));
    }

    await entry.save();
    console.log("Fichaje guardado en Back4App");
}

const esperandoUbicacion = new Map();

client.on('message', async msg => {
    const numero = msg.from.replace('@c.us', '');
    const texto = msg.body.trim().toUpperCase();

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

        msg.reply(`Fichaje de ${accion} guardado correctamente.`);
        return;
    }

    if (texto === "ENTRADA" || texto === "SALIDA") {
        const empleado = await buscarEmpleadoPorNumero(numero);
        if (!empleado) return msg.reply("No estás autorizado para fichar.");

        esperandoUbicacion.set(numero, { accion: texto, empleado });
        msg.reply("Envíame tu ubicación.");
        return;
    }

    msg.reply('Envía "ENTRADA" o "SALIDA".');
});

client.initialize();








const Parse = require('parse/node');
Parse.initialize(
    "Yo7aFmDqSDkWaUhdG4INURZzRQ0qIYNJohfBFajJ",
    "Sqmmtd0qegDYFAEyPW0phkHYw3aMFlAMCKDrEiQP"
);
Parse.serverURL = "https://parseapi.back4app.com/";

const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');

let qrImage = "";

// ---------- SERVIDOR WEB PARA MOSTRAR EL QR ----------
const app = express();
app.use(express.static('public'));

app.get('/qr', (req, res) => {
    if (!qrImage) return res.send("QR aún no generado…");

    res.send(`
        <h1>Escanea este QR</h1>
        <img src="${qrImage}" width="300" />
    `);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("Servidor QR en puerto", PORT));


// ---------- CLIENTE WHATSAPP SIN CHROMIUM ----------
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        executablePath: "none",  // 👈 IMPORTANTE
        args: [],
        headless: true
    }
});

client.on('qr', async qr => {
    qrImage = await QRCode.toDataURL(qr);
    console.log("Nuevo QR listo para escanear");
});

client.on('ready', () => {
    console.log("WhatsApp listo ✔");
});

client.on('auth_failure', msg => {
    console.log("Fallo de autenticación:", msg);
});

client.initialize();


// ---------- BOT ----------
async function buscarEmpleadoPorNumero(numero) {
    const Employees = Parse.Object.extend("Employees");
    const query = new Parse.Query(Employees);
    query.equalTo("telefono", numero);
    query.include("empresa");
    return await query.first();
}

async function guardarFichaje(data) {
    const TimeEntry = Parse.Object.extend("TimeEntries");
    const entry = new TimeEntry();
    entry.set(data);
    await entry.save();
}

client.on('message', async msg => {
    const numero = msg.from.replace("@c.us", "");
    const texto = msg.body.trim().toUpperCase();

    if (texto !== "ENTRADA" && texto !== "SALIDA") {
        return client.sendMessage(msg.from, 'Envía "ENTRADA" o "SALIDA" para fichar.');
    }

    const empleado = await buscarEmpleadoPorNumero(numero);
    if (!empleado) {
        return client.sendMessage(msg.from, "No estás autorizado para fichar.");
    }

    await guardarFichaje({
        nombre: empleado.get("nombre"),
        dni: empleado.get("dni"),
        numero,
        accion: texto,
        empresa: empleado.get("empresa"),
        fecha: new Date()
    });

    client.sendMessage(msg.from, `Fichaje de ${texto} registrado ✔`);
});


















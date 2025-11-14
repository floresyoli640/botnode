const Parse = require('parse/node');
Parse.initialize("Yo7aFmDqSDkWaUhdG4INURZzRQ0qIYNJohfBFajJ", "Sqmmtd0qegDYFAEyPW0phkHYw3aMFlAMCKDrEiQP");
Parse.serverURL = "https://parseapi.back4app.com/";

const express = require('express');
const wppconnect = require('@wppconnect-team/wppconnect');

let qrActual = "";

// ---------------------------
// SERVIDOR WEB PARA VER EL QR
// ---------------------------
const app = express();
app.get('/qr', (req, res) => {
    if (!qrActual) return res.send("QR aún no generado…");

    res.send(`
        <h2>Escanea este QR para iniciar sesión</h2>
        <img src="${qrActual}" width="300">
    `);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("Servidor QR iniciado en puerto", PORT));


// ---------------------------
// INICIAR WHATSAPP SIN CHROMIUM
// ---------------------------
wppconnect.create({
    session: "fichaje",
    headless: true,
    disableWelcome: true,

    // 🔥 ESTA OPCIÓN ES LO QUE ELIMINA CHROMIUM 🔥
    browserArgs: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage'
    ],

    catchQR: (qrData, asciiQR, attempts) => {
        qrActual = qrData;
        console.log("🌟 Nuevo QR generado: ver /qr");
    },

    puppeteerOptions: {
        executablePath: null   // 🔥 IMPIDE INSTALAR CHROMIUM
    }
})
.then(client => startBot(client))
.catch(err => console.error("❌ Error iniciando WhatsApp:", err));


// ---------------------------
// BOT DE FICHAJE
// ---------------------------
async function startBot(client) {
    console.log("✅ Bot iniciado sin Chromium.");

    const esperandoUbicacion = new Map();

    async function buscarEmpleadoPorNumero(numero) {
        const Employees = Parse.Object.extend("Employees");
        const query = new Parse.Query(Employees);
        query.equalTo("telefono", numero);
        query.include("empresa");
        return await query.first();
    }

    async function guardarFichaje({ nombre, dni, numero, empresa, accion, latitud, longitud }) {
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
        console.log("✔️ Fichaje guardado");
    }

    client.onMessage(async msg => {
        const numero = msg.from.replace("@c.us", "");
        const texto = msg.body.trim().toUpperCase();

        // --- UBICACIÓN ---
        if (esperandoUbicacion.has(numero) && msg.type === "location") {
            const { accion, empleado } = esperandoUbicacion.get(numero);
            esperandoUbicacion.delete(numero);

            await guardarFichaje({
                nombre: empleado.get("nombre"),
                dni: empleado.get("dni"),
                numero,
                empresa: empleado.get("empresa"),
                accion,
                latitud: msg.lat,
                longitud: msg.lng
            });

            return client.sendText(msg.from, `✔️ Fichaje de ${accion} guardado.`);
        }

        // --- ENTRADA / SALIDA ---
        if (texto === "ENTRADA" || texto === "SALIDA") {
            const empleado = await buscarEmpleadoPorNumero(numero);

            if (!empleado)
                return client.sendText(msg.from, "❌ No estás autorizado para fichar.");

            esperandoUbicacion.set(numero, { accion: texto, empleado });
            return client.sendText(msg.from, "📍 Envíame tu ubicación actual.");
        }

        client.sendText(msg.from, 'Envía "ENTRADA" o "SALIDA".');
    });
}
















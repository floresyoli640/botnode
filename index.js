const Parse = require('parse/node');
Parse.initialize("Yo7aFmDqSDkWaUhdG4INURZzRQ0qAYNJohfBFajJ", "Sqmmtd0qegDYFAEyPW0phkHYw3aMFlAMCKDrEiQP");
Parse.serverURL = "https://parseapi.back4app.com/";

const express = require('express');
const wppconnect = require('@wppconnect-team/wppconnect');

let qrActual = "";

// =====================================
// 🔹 SERVIDOR WEB PARA MOSTRAR EL QR
// =====================================
const app = express();
app.get('/qr', (req, res) => {
    if (!qrActual) return res.send("QR aún no generado…");

    res.send(`
        <h1>Escanea este código QR</h1>
        <img src="${qrActual}" style="width:280px;">
        <p>Si no funciona, recarga la página.</p>
    `);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("Servidor QR iniciado en puerto", PORT));


// =====================================
// 🔹 INICIO DE WPPConnect (SIN CHROMIUM)
// =====================================
wppconnect.create({
    session: 'fichaje',
    headless: true,
    browserArgs: ['--no-sandbox', '--disable-setuid-sandbox'],
    catchQR: async (qrBase64) => {
        qrActual = qrBase64;
        console.log("\nNuevo QR generado. Visita /qr para verlo.\n");
    }
})
.then(client => startBot(client))
.catch(err => console.log("Error al iniciar:", err));



// =====================================
// 🔹 LÓGICA DEL BOT DE FICHAJE
// =====================================
async function startBot(client) {

    const esperandoUbicacion = new Map();


    // --- Buscar empleado por teléfono ---
    async function buscarEmpleadoPorNumero(numero) {
        const Employees = Parse.Object.extend("Employees");
        const query = new Parse.Query(Employees);
        query.equalTo("telefono", numero);
        query.include("empresa");
        return await query.first();
    }


    // --- Guardar fichaje en Back4App ---
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
    }



    // =====================================
    // 🔹 EVENTO: MENSAJES RECIBIDOS
    // =====================================
    client.onMessage(async msg => {

        const numero = msg.from.replace("@c.us", "");
        const texto = msg.body.trim().toUpperCase();


        // --- Si envía ubicación ---
        if (esperandoUbicacion.has(numero) && msg.type === "location") {
            const { accion, empleado } = esperandoUbicacion.get(numero);
            esperandoUbicacion.delete(numero);

            await guardarFichajeEnBack4app({
                nombre: empleado.get("nombre"),
                dni: empleado.get("dni"),
                numero,
                empresa: empleado.get("empresa"),
                accion,
                latitud: msg.lat,
                longitud: msg.lng
            });

            await client.sendText(msg.from, `✅ Fichaje de *${accion}* guardado correctamente.`);
            return;
        }


        // --- Entrada o salida ---
        if (texto === "ENTRADA" || texto === "SALIDA") {
            const empleado = await buscarEmpleadoPorNumero(numero);

            if (!empleado)
                return client.sendText(msg.from, "❌ No estás autorizado para fichar.");

            esperandoUbicacion.set(numero, { accion: texto, empleado });

            return client.sendText(
                msg.from,
                "📍 Envíame tu *ubicación actual* (clip → Ubicación)."
            );
        }


        // --- Mensajes que no sean ENTRADA/SALIDA ---
        client.sendText(msg.from, 'Envía *"ENTRADA"* o *"SALIDA"* para fichar.');
    });
}















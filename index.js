const Parse = require('parse/node');
Parse.initialize("Yo7aFmDqSDkWaUhdG4INURZzRQ0qIYNJohfBFajJ", "Sqmmtd0qegDYFAEyPW0phkHYw3aMFlAMCKDrEiQP");
Parse.serverURL = "https://parseapi.back4app.com/";

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

/*  🔥 CONFIG ESPECIAL PARA RAILWAY 🔥
    Necesaria para evitar:
    "Running as root without --no-sandbox is not supported"
*/
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

// -------------------------------------
// QR y conexión
// -------------------------------------
client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
    console.log('Escanea este código QR con WhatsApp');
});

client.on('ready', () => {
    console.log('WhatsApp conectado y listo');
});

// Estado temporal de usuarios esperando ubicación
const waitingForLocation = new Map();

// -------------------------------------
// Buscar empleado
// -------------------------------------
async function buscarEmpleadoPorNumero(numero) {
    const Employees = Parse.Object.extend("Employees");
    const query = new Parse.Query(Employees);
    query.equalTo("telefono", numero);
    query.include("empresa");
    const resultado = await query.first();
    return resultado;
}

// -------------------------------------
// Guardar fichaje
// -------------------------------------
async function guardarFichajeEnBack4app({ nombre, dni, numero, empresa, accion, latitud, longitud }) {
    const TimeEntry = Parse.Object.extend("TimeEntries");
    const entry = new TimeEntry();

    entry.set("nombre", nombre);
    entry.set("dni", dni);
    entry.set("numero", numero);
    entry.set("accion", accion);
    entry.set("fecha", new Date());

    // Pointer robusto de empresa
    let empresaPointer = null;

    if (empresa && typeof empresa.get === 'function') {
        empresaPointer = empresa;
    } else if (empresa && empresa.objectId) {
        const Companies = Parse.Object.extend("Companies");
        empresaPointer = new Companies();
        empresaPointer.id = empresa.objectId;
    } else if (empresa && typeof empresa === 'string') {
        const Companies = Parse.Object.extend("Companies");
        empresaPointer = new Companies();
        empresaPointer.id = empresa;
    }

    if (empresaPointer) entry.set("empresa", empresaPointer);

    // Ubicación
    if (latitud !== undefined && longitud !== undefined) {
        const point = new Parse.GeoPoint({ latitude: latitud, longitude: longitud });
        entry.set("ubicacion", point);
    }

    try {
        await entry.save();
        console.log("Fichaje guardado en Back4app");
    } catch (error) {
        console.error("Error guardando en Back4app:", error);
    }
}

// -------------------------------------
// Manejo de mensajes
// -------------------------------------
client.on('message', async msg => {

    console.log('Mensaje recibido:', msg.body);

    const numero = msg.from.replace('@c.us', '');
    const texto = msg.body.trim().toUpperCase();

    // Si estamos esperando la ubicación
    if (waitingForLocation.has(numero) && msg.location) {

        const { accion, empleado } = waitingForLocation.get(numero);
        waitingForLocation.delete(numero);

        const nombre = empleado.get("nombre") || "-";
        const dni = empleado.get("dni") || "-";
        const empresa = empleado.get("empresa");
        const latitud = msg.location.latitude;
        const longitud = msg.location.longitude;

        await guardarFichajeEnBack4app({
            nombre, dni, numero, empresa, accion, latitud, longitud
        });

        msg.reply(`✅ Fichaje de ${accion} registrado para *${nombre}* a las ${new Date().toLocaleTimeString()}.`);
        return;
    }

    // Si envían ENTRADA o SALIDA
    if (texto === 'ENTRADA' || texto === 'SALIDA') {
        try {
            const empleado = await buscarEmpleadoPorNumero(numero);

            if (empleado) {
                waitingForLocation.set(numero, { accion: texto, empleado });
                msg.reply('📍 Por favor, comparte tu ubicación para registrar el fichaje.\n(Icono de clip → Ubicación)');
            } else {
                msg.reply('❌ Tu número no está autorizado para fichar.');
            }

        } catch (error) {
            console.error("Error buscando empleado:", error);
            msg.reply('❌ Error buscando tus datos.');
        }
    }
    else if (waitingForLocation.has(numero)) {
        msg.reply('📍 Aún estoy esperando tu ubicación. Por favor, envíala.');
    }
    else {
        msg.reply('Envía *ENTRADA* o *SALIDA* para fichar.');
    }
});

// -------------------------------------
// Iniciar WhatsApp
// -------------------------------------
client.initialize();






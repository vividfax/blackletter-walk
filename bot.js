const Canvas = require('canvas');
const fs = require('fs');
const GIFEncoder = require('gifencoder');
const imagemin = require('imagemin');
const imageminGifsicle = require('imagemin-gifsicle');
const Jimp = require('jimp');
const Mastodon = require('mastodon-api');
const OCRAD = require('ocrad.js');
const Twit = require('twit');

const config = require('./config');

const WIDTH = 1280;
const HEIGHT = 720;

const strokeScale = 20;
const strokeLength = 137;

let encoder = new GIFEncoder(WIDTH, HEIGHT);
let canvas = new Canvas(WIDTH, HEIGHT);
let ctx = canvas.getContext('2d');

function main() {

    let content = {
        ocrResult: '',
        imageSrc: '/blackletter.gif'
    };

    drawGif();
    savePng();

    setTimeout(function () {

        optimiseGif();
        prepOcrInput();

        setTimeout(function () {

            content.ocrResult = getOcr("ocr-input.png");

            setTimeout(function () {

                sendToot(content);
                sendTweet(content);

            }, 1000 * 30);
        }, 1000 * 5);
    }, 1000 * 5);
}

function drawGif() {

    startGif();
    setup();
    drawFrames();
    endGif();
}

function startGif() {

    encoder.createReadStream().pipe(fs.createWriteStream('blackletter.gif'));
    encoder.start();
    encoder.setRepeat(0); // 0 for repeat, -1 for no-repeat
    encoder.setDelay(1000 / 30); // frame delay in ms
    encoder.setQuality(20); // image quality. 10 is default.
    console.log('Making gif...');
}

function saveFrame() {
    encoder.addFrame(ctx);
}

function endGif() {
    encoder.finish();
    console.log('Saved gif');
}

function setup() {

    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.imageSmoothingEnabled = true;
    ctx.translate(WIDTH / 2, HEIGHT / 2);

    ctx.strokeStyle = '#FFF';
    ctx.lineWidth = 3;
}

function drawFrames() {

    let position = {
        x: 0,
        y: -strokeLength / 2
    };
    let place = {
        x: 0,
        y: 1
    };
    let direction = 'S';

    for (let i = 0; i < 40; i++) {

        if (i > 36) {
            direction = 'NONE';
        }
        position = drawStroke(position, direction);
        place = updatePlace(place, direction);
        direction = randomDirection(direction, place);
    }
}

function randomDirection(direction, place) {

    const maxWidth = 11;
    let validDirections = ['N', 'NE', 'SE', 'S', 'SW', 'NW'];

    switch (place.y) {
        case 0:
            validDirections = ['NE', 'S', 'S', 'NW'];
            break;
        case 1:
            validDirections = ['N', 'NE', 'NE', 'S', 'S', 'NW', 'NW'];
            break;
        case 2:
            validDirections = ['N', 'N', 'SE', 'SE', 'S', 'SW', 'SW'];
            break;
        case 3:
            validDirections = ['N', 'N', 'SE', 'SW'];
            break;
    }
    switch (direction) {
        case 'NE':
        case 'NW':
            if (place.y <= 1) {
                validDirections = ['SE', 'SW'];
            }
            break;
        case 'SE':
        case 'SW':
            if (place.y >= 2) {
                validDirections = ['NE', 'NW'];
            }
            break;
    }
    if (place.x == maxWidth || place.x == -maxWidth) {
        switch (direction) {
            case 'NE':
                validDirections = ['SW'];
                break;
            case 'SE':
                validDirections = ['NW'];
                break;
            case 'SW':
                validDirections = ['NE'];
                break;
            case 'NW':
                validDirections = ['SE'];
                break;
        }
    }
    direction = validDirections[Math.floor(Math.random() * (validDirections.length))];

    return direction;
}

function getVelocity(direction) {

    const xDiagonal = strokeScale * 2 / strokeLength;
    const yDiagonal = Math.tan(35 * Math.PI / 180) * xDiagonal;
    let velocity = {};

    switch (direction) {
        case 'N':
            velocity.x = 0;
            velocity.y = -1;
            break;
        case 'NE':
            velocity.x = xDiagonal;
            velocity.y = -yDiagonal;
            break;
        case 'SE':
            velocity.x = xDiagonal;
            velocity.y = yDiagonal;
            break;
        case 'S':
            velocity.x = 0;
            velocity.y = 1;
            break;
        case 'SW':
            velocity.x = -xDiagonal;
            velocity.y = yDiagonal;
            break;
        case 'NW':
            velocity.x = -xDiagonal;
            velocity.y = -yDiagonal;
            break;
        case 'NONE':
            velocity.x = 0;
            velocity.y = 0;
            break;
    }
    return velocity;
}

function updatePlace(place, direction) {

    switch (direction) {
        case 'N':
            place.y -= 1;
            break;
        case 'NE':
        case 'SE':
            place.x += 1;
            break;
        case 'S':
            place.y += 1;
            break;
        case 'SW':
        case 'NW':
            place.x -= 1;
            break;
    }
    return place;
}

function drawStroke(position, direction) {

    const velocity = getVelocity(direction);

    for (let i = 0; i < strokeLength; i++) {

        drawLine(position.x, position.y);
        position.x += velocity.x;
        position.y += velocity.y;

        if (i % 17 == 1) {
            saveFrame();
        }
    }
    return position;
}

function drawLine(x, y) {

    const yOffset = strokeScale * Math.tan(35 * Math.PI / 180);

    ctx.beginPath();
    ctx.moveTo(x - strokeScale, y + yOffset);
    ctx.lineTo(x + strokeScale, y - yOffset);
    ctx.stroke();
}

function savePng() {

    let out = fs.createWriteStream(__dirname + '/ocr-input.png');
    let stream = canvas.pngStream();

    stream.on('data', function (chunk) {
        out.write(chunk);
    });
    stream.on('end', function () {
        console.log('Saved png');
    });
}

function prepOcrInput() {

    Jimp.read('ocr-input.png', function (err, image) {
        if (err) throw err;

        image.invert()
            .brightness(.5)
            .contrast(.5)
            .resize(154, 86)
            .write('ocr-input.png');
    });
    console.log('OCR input ready');
}

function getOcr(filename) {

    let img = new Canvas.Image();
    img.src = filename;

    let canvas = new Canvas(img.width, img.height);
    let ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, img.width, img.height);

    let ocrResult = OCRAD(canvas);
    console.log('OCR: ' + ocrResult);

    return ocrResult;
}

function optimiseGif() {

    imagemin(['blackletter.gif'], '.', {
        use: [imageminGifsicle({
            optimizationLevel: 2
        })]
    }).then(() => {
        console.log('Optimized gif');
    });
}

function sendToot(content) {

    const M = new Mastodon(config.mastodon);

    M.post('media', {
        file: fs.createReadStream(__dirname + content.imageSrc)
    }).then(resp => {
        const id = resp.data.id;
        M.post('statuses', {
            status: content.ocrResult,
            media_ids: [id]
        })
    });
}

function sendTweet(content) {

    const T = new Twit(config.twitter);

    const b64content = fs.readFileSync(__dirname + content.imageSrc, {
        encoding: 'base64'
    });
    T.post('media/upload', {
        media_data: b64content
    }, function (err, data, response) {
        let mediaIdStr = data.media_id_string
        let meta_params = {
            media_id: mediaIdStr
        }
        T.post('media/metadata/create', meta_params, function (err, data, response) {
            if (!err) {
                let params = {
                    status: content.ocrResult,
                    media_ids: [mediaIdStr]
                }
                T.post('statuses/update', params, function (err, data, response) {
                    console.log(data)
                })
            }
        })
    });
}

main();

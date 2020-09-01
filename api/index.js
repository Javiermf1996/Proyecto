'use strict'

const mongoose = require('mongoose')
const app = require('./app')
const config = require('./config')


let EventEmitter = require("events").EventEmitter,
	Express = require("express"),
	WebSocket = require("ws");
    
mongoose.set('useNewUrlParser', true)  
mongoose.set('useUnifiedTopology', true)
 
//mongoose.set('useFindAndModify', false);
mongoose.set('useCreateIndex', true);

mongoose.connect(config.db, (err, res) => {
    if(err){
        return console.log(`Error al conectar a la base de datos ${err}`)
    } 
    console.log('Conexion establecida')

    app.listen(config.port, () => {
        console.log(`Api Rest corriendo en http://localhost:${config.port}`)
    }) 
 
})

 


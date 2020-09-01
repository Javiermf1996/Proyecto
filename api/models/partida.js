'use strict'

const mongoose = require('mongoose')
const Schema = mongoose.Schema
const PartidaSchema = Schema({
    name: String,
    ganador: String,
    descripcion: String,
    tiempo:  Number
})

module.exports = mongoose.model('Partida', PartidaSchema)

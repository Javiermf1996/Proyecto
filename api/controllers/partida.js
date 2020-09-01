'use strict'

const Partida = require('../models/partida')
function getPartida(req, res){
    let partidaId = req.params.partidaId

    Partida.findById(partidaId, (err, partida) => {
      if(err) return res.status(500).send({message : `Error al realizar la petición`})
      if(!partida) return res.status(404).send({message: 'El producto no existe'})
   
      res.status(200).send({partida})
    })
}

function getPartidas(req, res){
    Partida.find({}, (err, partidas) => {
        if(err) return res.status(500).send({message : `Error al realizar la petición`})
        if(!partidas) return res.status(404).send({message : 'No existen partidas'})

        res.status(200).send({partidas})
    })
  //  res.send(200, {partidas})
}


function savePartida(req, res){
    console.log('post /api/partida')
    console.log(req.body)
    let partida = new Partida()
    partida.name = req.body.name
    partida.ganador = req.body.ganador
    partida.descripcion = req.body.descripcion
    partida.tiempo = req.body.tiempo
   
    partida.save((err, partidaStored) =>{
    if(err) res.status(500).send({message : `Error al salvar en la base de datos: ${err}`})
    
    res.status(200).send({partida: partidaStored})
    })
}
function updatePartida(req, res){
    let partidaId = req.params.partidaId
    let update = req.body
    Partida.findByIdAndUpdate(partidaId, update, (err, partidaUpdated) => {
      if (err) res.status(500).send({message : `Error al actualizar la partida: ${err}`})
   
      res.status(200).send({ partida: partidaUpdated})
    })  
}

function deletePartida(req, res){
    let partidaId = req.params.partidaId

    Partida.findById(partidaId, (err) =>{
      if (err) res.status(500).send({message : `Error al borrar la partida: ${err}`})
  
      Partida.deleteOne(err => {
        if(err) res.status(500).send({message: `Error al borrar el partida: ${err}`})
  
        res.status(200).send({message : `La partida se ha borrado con exito`})
      })
    })
}

module.exports = {
    getPartida,
    getPartidas,
    savePartida,
    updatePartida,
    deletePartida
}
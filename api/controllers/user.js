'use strict'
 
const User = require('../models/user')
const service = require('../services')

function signUp(req, res){
    console.log('request:' + req.body.email + req.body.displayName + req.body.password )
 const user = new User({
     email: req.body.email,
     displayName: req.body.displayName,
     password: req.body.password
 })
 
 user.save((err) => {
     if (err) return res.status(500).send({ message: `Error al crear el usuario: ${err}`})

     return res.status(201).send({ token: service.createToken(user)})
 })
}

function signIn(req, res){

    User.findOne({ email: req.body.email} , (err, user) =>{

        console.log(req.body.email)

        if(err) return res.status(500).send({message : err})

        if(!user) return res.status(404).send({message : 'No existe el usuario'})

        req.user = user

        res.status(200).send({
            message : 'Estas logueado',
            token: service.createToken(user)
        })
    })
}

function getUsers(req, res){
    User.find({}, (err, users) => {
        if(err) return res.status(500).send({message : `Error al realizar la petición`})
        if(!users) return res.status(404).send({message : 'No existen users'})

        res.status(200).send({users})
    })
  //  res.send(200, {users})
}

module.exports = {
    signUp,
    signIn,
    getUsers
}  
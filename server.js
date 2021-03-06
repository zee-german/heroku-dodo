const express = require('express')
const bodyParser = require('body-parser')
const _ = require('underscore')

const db = require('./db')
const middleware = require('./middleware')(db)

const app = express()

const PORT = process.env.PORT || 3000

app.use(bodyParser.json())

// GET

app.get('/', (req, res) => {
  res.send('Todo API Root')
})

app.get('/todos', middleware.requireAuthentication, (req, res) => {
  let qParams = req.query
  let where = {
    userId: req.user.get('id')
  }

  if (qParams.hasOwnProperty('completed') && qParams.completed === 'true') where.completed = true
  else if (qParams.hasOwnProperty('completed') && qParams.completed === 'false') where.completed = false

  if (qParams.hasOwnProperty('q') && qParams.q.length > 0) {
    where.description = { $like: '%' + qParams.q + '%' }
  }

  db.todo.findAll({where})
    .then(todos => res.json(todos), e => res.send(500).send())
})

app.get('/todos/:id', middleware.requireAuthentication, (req, res) => {
  let todoId = parseInt(req.params.id, 10)

  db.todo.findOne({
    where: {
      userId: req.user.get('id'),
      id: todoId
    }
  })
    .then(todo => {
      todo
      ? res.json(todo.toJSON())
      : res.status(404).send('oopsie')
    }, e => res.status(500).send())
    .catch(ex => console.error(ex.message))
})

// POST

app.post('/todos', middleware.requireAuthentication, (req, res) => {
  let body = _.pick(req.body, 'description', 'completed')

  db.todo.create(body)
    .then(
      todo => {
        req.user.addTodo(todo)
          .then(() => { return todo.reload() })
          .then(todo => res.json(todo.toJSON()))
      },
      e => res.status(400).json(e)
    )
})

app.post('/users', (req, res) => {
  let body = _.pick(req.body, 'email', 'password')

  db.user.create(body)
    .then(
      user => res.json(user.toPublicJSON()),
      e => res.status(400).json(e)
    )
})

app.post('/users/login', (req, res) => {
  let body = _.pick(req.body, 'email', 'password')
  let userInstance

  db.user.authenticate(body)
    .then(
      user => {
        let token = user.generateToken('authentication')
        userInstance = user
        return db.token.create({token})
      })
      .then(tokenInstance => res.header('Auth', tokenInstance.get('token')).json(userInstance.toPublicJSON()))
      .catch(e => res.status(401).send())
})

// DELETE

app.delete('/todos/:id', middleware.requireAuthentication, (req, res) => {
  let todoId = parseInt(req.params.id, 10)

  db.todo.destroy({
    where: {
      id: todoId,
      userId: req.user.get('id')
    }
  })
    .then(rowsDeleted => {
      rowsDeleted === 0
      ? res.status(404).json({ error: 'No todo with id ' + todoId })
      : res.status(204).send()
    }, () => res.status(500).send())
})

app.delete('/users/login', middleware.requireAuthentication, (req, res) => {
  req.token.destroy()
  .then(() => res.status(204).send())
  .catch(() => res.status(500).send())
})

// UPDATE

app.put('/todos/:id', middleware.requireAuthentication, (req, res) => {
  let body = _.pick(req.body, 'description', 'completed')
  let todoId = parseInt(req.params.id, 10)
  let attributes = {}

  if (body.hasOwnProperty('completed')) {
    attributes.completed = body.completed
  }

  if (body.hasOwnProperty('description')) {
    attributes.description = body.description
  }

  db.todo.findOne({
    where: {
      id: todoId,
      userId: req.user.get('id')
    }
  })
    .then(todo => {
      if (todo) {
        return todo.update(attributes)
      } else {
        res.status(404).send()
      }
    }, () => res.status(500).send())
    .then(todo => res.json(todo.toJSON()), e => res.status(400).json(e))
})

db.sequelize.sync({force: true}).then(() => {
  app.listen(PORT, () => console.log('Express listening on port ' + PORT))
})

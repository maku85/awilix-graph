// Example Awilix container used to demo awilix-graph.
// Run: npm run example
const { createContainer, asClass, asFunction, asValue, Lifetime } = require('awilix')

// --- registrations ---

class Logger {
  log(msg) { console.log('[log]', msg) }
}

class Database {
  constructor({ logger, config }) {
    this.logger = logger
    this.config = config
  }
}

class UserRepository {
  constructor({ database }) {
    this.database = database
  }
}

class OrderRepository {
  constructor({ database }) {
    this.database = database
  }
}

// Factory function (asFunction)
const makeTokenService = ({ config }) => ({
  sign:   payload => `jwt:${JSON.stringify(payload)}`,
  verify: token   => JSON.parse(token.replace('jwt:', '')),
})

class AuthService {
  constructor({ userRepository, tokenService }) {
    this.userRepository = userRepository
    this.tokenService   = tokenService
  }
}

class OrderService {
  constructor({ orderRepository, authService, logger }) {
    this.orderRepository = orderRepository
    this.authService     = authService
    this.logger          = logger
  }
}

// smtpClient is intentionally NOT registered — will appear as a missing node in the graph
class EmailService {
  constructor({ config, logger, smtpClient }) {
    this.config     = config
    this.logger     = logger
    this.smtpClient = smtpClient
  }
}

// --- container assembly ---

const container = createContainer()

container.register({
  // values
  config: asValue({ port: 3000, db: { host: 'localhost', port: 5432 } }),

  // singletons
  logger:   asClass(Logger,   { lifetime: Lifetime.SINGLETON }),
  database: asClass(Database, { lifetime: Lifetime.SINGLETON }),

  // repositories
  userRepository:  asClass(UserRepository),
  orderRepository: asClass(OrderRepository),

  // services
  tokenService: asFunction(makeTokenService),
  authService:  asClass(AuthService),
  orderService: asClass(OrderService),
  emailService: asClass(EmailService),  // smtpClient dep is missing
})

module.exports = container

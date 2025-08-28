const express = require("express")
const cors = require("cors")

const buildJwtHelper = require("./utils/jwtHelper")
const callback = require("./utils/expressCallback")

const {
  AuthorizeUser,
  CreateUser,
  RefreshToken,
  CreateKey,
  DeleteKey,
  CharacterInfo,
} = require("./controllers/index")

const jwtHelper = buildJwtHelper()

const app = express()

app.use(cors())
app.use(express.json())



const redis = require('redis');
const client = redis.createClient();

client.connect().then(() => {
    console.log('Connected to Redis');
}).catch((err) => console.log('Redis Connection Error:', err));

const cacheMiddleware = (keyGenerator) => {
  return async (req, res, next) => {
    try {
      const key = keyGenerator(req); // Generate a key for this request
      const cachedData = await client.get(key);

      if (cachedData) {
        // If cache exists, return it
        return res.json(JSON.parse(cachedData));
      } else {
        // Override res.json to store response in Redis
        res.sendResponse = res.json;
        res.json = (body) => {
          client.setEx(key, 60, JSON.stringify(body)); // Cache for 60s
          res.sendResponse(body);
        };
        next();
      }
    } catch (err) {
      console.error(err);
      next();
    }
  };
};





// healthcheck
app.get("/", (req, res) => res.status(200).send("Ok 🎃"))
// User routes
app.post("/user/create", callback(CreateUser))
app.post("/user/authorize", callback(AuthorizeUser))
app.post("/user/refresh", callback(RefreshToken))
// Can be used to create apiKeys in the future
app.post("/key/create", applyMiddleware(auth, callback(CreateKey)))
app.delete("/key/delete", applyMiddleware(auth, callback(DeleteKey)))
// Character routes
// app.get("/character/info", callback(CharacterInfo))


// Assuming you already have `client` as your Redis client and cacheMiddleware in app.js

// Updated route with cache middleware
app.get(
  "/character/info",
  cacheMiddleware(() => "character_info"), // Redis key for this route
  async (req, res) => {
    try {
      const data = await CharacterInfo(); // your existing callback function
      res.json(data);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Something went wrong" });
    }
  }
);


function applyMiddleware(middleware, callback) {
  return (req, res, next) => {
    req = middleware(req, res, next)
    callback(req, res, next)
  }
}

function auth(req, res) {
  try {
    const jwt = req.headers.authorization.split("Bearer ")[1]
    const { userId, email } = jwtHelper.decode(jwt)
    req.context = {}
    req.context.userId = userId
    req.context.email = email
    return req
  } catch (error) {
    console.error(error)
    res.status(401).send({ success: false, message: "Invalid authorization" })
  }
}

module.exports = app

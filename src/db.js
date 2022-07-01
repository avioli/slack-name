const Sequelize = require("sequelize");

// setup a new database
// using database credentials set in .env
const sequelize = new Sequelize(
  "database",
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: "0.0.0.0",
    dialect: "sqlite",
    pool: {
      max: 5,
      min: 0,
      idle: 10000,
    },
    // Security note: the database is saved to the file `database.sqlite` on the local filesystem.
    // It's deliberately placed in the `.data` directory which doesn't get copied if someone remixes the project.
    storage: ".data/database.sqlite",
  }
);

const db = { User: null };

// authenticate with the database
sequelize
  .authenticate()
  .then((err) => {
    console.log("DB connection has been established successfully.");
    db.User = sequelize.define("users", {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
      },
      accessToken: {
        type: Sequelize.STRING,
      },
    });
    db.User.sync();
  })
  .catch((err) => {
    console.log("Unable to connect to the database: ", err);
  });

module.exports = db;

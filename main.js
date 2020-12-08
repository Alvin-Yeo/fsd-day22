// load libraries
const express = require('express');
const secureEnv = require('secure-env');
const mysql = require('mysql2/promise');

// environment configuration
global.env = secureEnv({ secret: 'isasecret' });
const APP_PORT = global.env.APP_PORT;
const SQL_GET_ORDER_INFO = 'select order_date, customer_id, total_price, total_discount, cost_price from computed_orders where id = ?';

// create db connection pool
const pool = mysql.createPool({
    host: global.env.MYSQL_SERVER,
    port: global.env.MYSQL_SERVER_PORT,
    user: global.env.MYSQL_USERNAME,
    password: global.env.MYSQL_PASSWORD,
    database: global.env.MYSQL_SCHEMA,
    connectionLimit: global.env.MYSQL_CONN_LIMIT
});

// Closure for functions to make queries to db with connection in pool
const makeQuery = (sql, pool) => {
    return (async (args) => {
        const conn = await pool.getConnection();
       
        try {
            const results = await conn.query(sql, args || []);
            return results[0];
        } catch(e) {
            console.error('Error getting connection from pool: ', e);
        } finally {
            conn.release();
        }
    });
};

// Create query functions from closure
const getOrderInfo = makeQuery(SQL_GET_ORDER_INFO, pool);

// Funtion to format decimal places for currency
const formatCurrency = (data) => {
    return parseFloat(data).toFixed(2);
}

// create an instance of express
const app = express();

// resources
app.get('/order', (req, res) => {
    const orderNo = req.query['orderNo'];
    res.redirect(`/order/total/${orderNo}`);
});

app.get('/order/total/:id', async(req, res) => {
    const id = req.params['id'];
    // console.log('id: ', id);

    const result = await getOrderInfo([ id ]);
    // console.log('Database result: ', result);

    if(result.length > 0) {
        res.status(200);
        res.format({
            html: () => {
                res.send(`
                    <h1>Your order details:</h1>
                    <p>Order id: ${id}</p>
                    <p>Order date: ${ result[0]['order_date'].toDateString() }</p>
                    <p>Customer id: ${result[0]['customer_id']}</p>
                    <p>Total price: $${ formatCurrency(result[0]['total_price']) }</p>
                    <p>Total discount: $${ formatCurrency(result[0]['total_discount']) }</p>
                    <p>Cost price: $${ formatCurrency(result[0]['cost_price']) }</p>
                `);
            },
            json: () => {
                res.send({
                    'Order id': id,
                    'Order date': result[0]['order_date'].toDateString(),
                    'Customer id': result[0]['customer_id'],
                    'Total price': formatCurrency(result[0]['total_price']),
                    'Total discount': formatCurrency(result[0]['total_discount']),
                    'Cost price': formatCurrency(result[0]['cost_price'])
                });
            }
        });
    } else {
        res.status(404);
        res.format({
            html: () => {
                res.send(`<p>No record found for this order id: ${id}</p>`);
            },
            json: () => {
                res.send({ Error: `404. Record not found with order id ${id}`});
            }
        });
    }
});

app.use(express.static(__dirname + '/static'));

app.use((req, res) => {
    res.redirect('/');
});

// test db connection before starting server
const startApp = async(app, pool) => {
    try {
        const conn = await pool.getConnection();
        
        console.info(`Pinging database...`);
        
        await conn.ping();

        conn.release();

        console.info(`Pinging database successfully.`);

        app.listen(APP_PORT, () => {
            console.info(`Application started on PORT ${APP_PORT} at ${new Date()}`);
        });
    } catch(e) {
        console.error(`Unable to start the server. Failed to ping database: ${e}`);
    }
}

// start server
startApp(app, pool);
import express from 'express';
import mongoose from 'mongoose';
import { nanoid } from 'nanoid';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import geoip from 'geoip-lite';
import moment from 'moment';
import useragent from 'useragent';
import dotenv from 'dotenv';
import ip from "ip"
import {OAuth2Client} from 'google-auth-library';
import session from 'express-session';
import redis from 'redis';

const BASE_URL = 'http://localhost:5000/api/shorten'


const app = express();
dotenv.config()

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRETE;
const REDIRECT_URI = process.env.REDIRECT_URI;
const SESSION_SECRET = process.env.SESSION_SECRET;

const oauth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  }));

//   const client = redis.createClient({
//     host: 'localhost',   
//     port: 6379           
//   });
  
//   client.on('connect', () => {
//     console.log("connected to radis");
//   });


//   client.on('error', (err) => {
//     console.log('Redis error: ', err);
//   });

//   client.connect();

app.use(cors({origin:'*'}))
app.use(express.json({limit:"150mb"}))
app.use(express.urlencoded({extended:true}))


mongoose.connect('mongodb://127.0.0.1:27017/Assesment')
    .then(() => console.log("MongoDB connected Successfully"))
    .catch((err) => console.log("Error connecting to MongoDB:", err));



//Url Table
const urlSchema = new mongoose.Schema({
    longUrl: { type: String, required: true },
    shortUrl: { type: String, required: true },
    alias:{type:String},
    createdAt: { type: Date, default: Date.now },
    topic: { type: String}
});

const URL = mongoose.model('URL', urlSchema);



// Analytics Table 

const analyticsSchema = new mongoose.Schema({
    shortUrl: { type: String, required: true },
    longUrl: { type: String, required: true },
    ip1: { type: [String], required: true },
    userAgent: { type: String },
    timestamp: { type: Date},
    location: { type: String},
    clickCount: { type: Number, default: 0 },
    osType: { type: String },  
    deviceType: { type: String },
    topic: { type: String},
    user_id:{type:mongoose.Schema.Types.ObjectId,
        ref:'User'
    }
});

const Analytics = mongoose.model('Analytics', analyticsSchema);

const userSchema = new mongoose.Schema({
    googleId: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    firstName: { type: String },
    lastName: { type: String },
  });
  const User = mongoose.model("User", userSchema);



const shortenRateLimiter = rateLimit({
    windowMs: 60 * 1000, 
    max:5,
    message: 'Too many URLs created from this IP, please try again after a minute',
    standardHeaders: true,
    legacyHeaders: false, 
});


const logAnalytics = async ({ shortUrl, longUrl, ip1, userAgent, timestamp, location, osType, deviceType, user_id, topic }) => {
    try {
        const existingAnalytics = await Analytics.findOne({ shortUrl });

        if (existingAnalytics) {
            
            if (!existingAnalytics.ip1.includes(ip1)) {
                await Analytics.updateOne({ shortUrl }, 
                    { $push: { ip1: ip1 } });
            }
        } else {
            await Analytics.create({shortUrl,longUrl,ip1: [ip1], userAgent, timestamp,location,osType,deviceType,user_id,topic});
        }
    } catch (error) {
        console.error('Error log in analytics:', error);
    }
};



// google authentication login register
app.get('/', async (req, res) => {
    console.log(req.session,"ttttttttttttttttttttt")
    if (req.session.token) {
        oauth2Client.setCredentials(req.session.token.tokens);

        if (oauth2Client.isTokenExpiring()) {
            try {
                const { tokens } = await oauth2Client.refreshAccessToken();
                oauth2Client.setCredentials(tokens);
                req.session.token.tokens = tokens; 
                console.log('Token refreshed');
            } catch (error) {
                console.error('Error refreshing access token:', error);
                return res.send('Error refreshing token');
            }
        }

        // Fetch the user info
        oauth2Client.request({ url: 'https://www.googleapis.com/oauth2/v3/userinfo' })
            .then(async(response) => {
                const userInfo = response.data;
                let user = await User.findOne({ email: userInfo.email });
                if(!user){
                    await User.create({
                        googleId: userInfo.sub,
                        email: userInfo.email,
                        firstName: userInfo.given_name,
                        lastName: userInfo.family_name,
                    })
                }else{
                    console.log('Existing user find!')
                }
                res.send(`<h1>Welcome, ${userInfo.name}</h1><p>Email: ${userInfo.email}</p><a href="/logout">Logout</a>`);
            })
            .catch(error => {
                console.error('Error fetching:', error);
                res.send('Error fetching user info');
            });
    } else {
        res.send('<h1>Home</h1><a href="https://url-shortner.mooo.com/auth/google">Login with Google</a>');
    }
});

// let scopes = ['https://www.googleapis.com/auth/webmasters'];
const scopes = ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email'];

  
  app.get('/auth/google', (req, res) => {
    const authorizationUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['profile', 'email']
    });
    res.redirect(authorizationUrl);
  });


app.get('/auth/callback', async (req, res) => {
    const { code } = req.query;
    try {
        const tokens = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        req.session.token = tokens;

        res.redirect('/');
    } catch (error) {
        res.send('Authentication failed');
    }
});
  

app.get('/getusers',async(req,res)=>{
    try {
        const getdata = await User.find({})
        res.status(200).json({status:1, getdata})
    } catch (error) {
        res.status(500).json({status:0, error:error.message})
    }
})

app.post('/api/shorten',shortenRateLimiter, async (req, res) => {
    try {
        const postdata = req.body;

        const shortId = nanoid(7);
        const shortUrl = `${BASE_URL}/${shortId}`;
        postdata.shortUrl = shortUrl;
        postdata.alias = shortId;
        postdata.topic = req.body.topic

        const adddata = await URL.create(postdata);

        res.status(200).json({status:1, adddata})
    } catch (error) {
        res.status(500).json({status:0, error:error.message})
    }
});


const generalRateLimiter = rateLimit({
    windowMs: 60 * 1000, 
    max: 10, 
    message: 'Too many requests, please try again later.',
});


app.get('/api/shorten/:id',generalRateLimiter, async (req, res) => {
    try {
        var query = {};
        const { id } = req.params;
        const user_id = req.query.userid;
        console.log(user_id,"user_iduser_id")

        let url = await URL.findOne({ shortUrl: `${BASE_URL}/${id}` });

        if (url) {
            const ip1 = ip.address();
   
            const userAgent = req.get('User-Agent');
            const timestamp = moment().format('YYYY-MM-DD HH:mm:ss'); 

            const geo = geoip.lookup(ip1);
            const location = geo ? `${geo.city}, ${geo.country}` : 'Unknown';

            const agent = useragent.parse(userAgent);
        
            const osType = agent.os.family;  

            const deviceType = agent.device.family === 'Other' ? 'Desktop' : agent.device.family;
        
            await logAnalytics({ 
                shortUrl: `${BASE_URL}/${id}`, 
                longUrl: url.longUrl, 
                ip1, 
                userAgent:agent, 
                timestamp, 
                location,
                osType,
                deviceType,
                user_id:req.query.user_id,
                topic: url.topic
            });


            res.redirect(url.longUrl);
        } else {
            return res.status(404).send('URL not found');
        }

    } catch (error) {
        res.status(500).json({ error: error.message })
    }
});



app.get('/api/analytics/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const findan = await Analytics.findOne({ shortUrl: `${BASE_URL}/${id}` });

        if (!findan) {
            return res.status(404).json({ error: 'Analytics not found' });
        }

        await Analytics.updateOne(
            { shortUrl: findan.shortUrl },
            { $inc: { clickCount: 1 } }
        );

        const totalClicks = (await Analytics.findOne({ shortUrl: `${BASE_URL}/${id}` })).clickCount;

        const uniqueVisitors = findan.ip1.length;

        const last7Days = [];
        for (let i = 6; i >= 0; i--) {
            const startOfDay = moment().subtract(i, 'days').startOf('day').toDate();
            const endOfDay = moment().subtract(i, 'days').endOf('day').toDate();
            const dailyClicks = await Analytics.countDocuments({
                shortUrl: `${BASE_URL}/${id}`,
                timestamp: { $gte: startOfDay, $lt: endOfDay },
            });

            last7Days.push({
                date: moment().subtract(i, 'days').format('YYYY-MM-DD'),
                clickCount: dailyClicks,
            });
        }

        const osTypes = await Analytics.aggregate([
            {
                 $match: {
                     shortUrl: `${BASE_URL}/${id}` 
                    } 
            },
            { 
                $group: {
                     _id: "$osType",
                      uniqueClicks: { $sum: 1 },
                       uniqueUsers: { $addToSet: "$ip1" }
                     } 
            },
            { 
                $project: {
                     osName: "$_id",
                      uniqueClicks: 1,
                       uniqueUsers: {
                         $size: "$uniqueUsers" 
                        } 
                    }
            },
        ]);


        const deviceTypes = await Analytics.aggregate([
            {
                 $match: { 
                    shortUrl: `${BASE_URL}/${id}`
                 } 
            },
            {
                $group:
                  { 
                    _id: "$deviceType", uniqueClicks: { $sum: 1 }, uniqueUsers: { $addToSet: "$ip1" } 
                  } 
            },
            { 
                $project: {
                    deviceName: "$_id",
                    uniqueClicks: 1,
                    uniqueUsers: { $size: "$uniqueUsers" } 
                    }
            },
        ]);

        res.status(200).json({
            shortUrl: `${BASE_URL}/${id}`,
            totalClicks,
            uniqueVisitors,
            ClickByDate: last7Days,
            osType: osTypes,
            deviceType: deviceTypes,
        });
    } catch (error) {
        console.log(error, "error");
        res.status(500).json({ error: error.message });
    }
});



app.get('/api/analytics/topic/:id', async (req, res) => {
    try {
        const { id } = req.params; 

        const analyticsData = await Analytics.find({ topic: id });

        if (!analyticsData || analyticsData.length === 0) {
            return res.status(404).json({ status: 2, error: 'No analytics data found for this topic' });
        }


        const totalClicks = analyticsData.reduce((acc, item) => acc + item.clickCount, 0);


        const uniqueIps = new Set();
        analyticsData.forEach(item => item.ip1.forEach(ip => uniqueIps.add(ip)));
        const uniqueClicks = uniqueIps.size;


        const clicksByDate = await Analytics.aggregate([
            { $match: { topic: id, timestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } }, 
            { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } }, totalClicks: { $sum: "$clickCount" } } },
            { $sort: { "_id": 1 } } 
        ]);


        const urls = await Analytics.aggregate([
            {
                 $match: { topic: id } 
            },
            { 
                $group: {
                _id: "$shortUrl",
                totalClicks: { $sum: "$clickCount" },
                uniqueClicks: { $addToSet: "$ip1" }  
               }
            }, 
            {
                 $project: {
                shortUrl: "$_id",
                totalClicks: 1,
                uniqueClicks: { $size: "$uniqueClicks" },
                _id: 0
                }
            }
        ]);

        res.status(200).json({
            status: 1,
            totalClicks,
            uniqueClicks,
            clicksByDate,
            urls
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 0, error: error.message });
    }
});



app.get('/api/analytics1/overall', async (req, res) => {
    try {

        const analyticsData = await Analytics.find({ });

        if (!analyticsData || analyticsData.length === 0) {
            return res.status(404).json({ status: 0, error: 'No analytics data found for this user' });
        }
        const totalUrls = analyticsData.length;

        const totalClicks = analyticsData.reduce((acc, item) => acc + item.clickCount, 0);

        const uniqueIps = new Set();
        analyticsData.forEach(item => item.ip1.forEach(ip => uniqueIps.add(ip)));
        const uniqueUsers = uniqueIps.size;

        const clicksByDate = await Analytics.aggregate([
            { $match: {  timestamp: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } },  
            { $group: { 
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
                totalClicks: { $sum: "$clickCount" }
            }},
            { $sort: { "_id": 1 } }
        ]);

        const osType = await Analytics.aggregate([
            { 
                $match: {
                    osType: { $ne: null }
                }
            },
            { $group: {
                _id: "$osType", 
                uniqueClicks: { $sum: "$clickCount" },
                uniqueUsers: { $addToSet: "$ip1" }
            }},
            { $project: {
                osName: "$_id",
                uniqueClicks: 1,
                uniqueUsers: { $size: "$uniqueUsers" },
                _id: 0
            }}
        ]);

        const deviceType = await Analytics.aggregate([
            { 
                $match: {
                    deviceType: { $ne: null }  
                }
            },
            { $group: {
                _id: "$deviceType", 
                uniqueClicks: { $sum: "$clickCount" },
                uniqueUsers: { $addToSet: "$ip1" }
            }},
            { $project: {
                deviceName: "$_id",
                uniqueClicks: 1,
                uniqueUsers: { $size: "$uniqueUsers" },
                _id: 0
            }}
        ]);

        res.status(200).json({status: 1,totalUrls,totalClicks,uniqueUsers,clicksByDate,osType,deviceType});
    } catch (error) {
        res.status(500).json({ status: 0, error: error.message });
    }
});



const PORT = 5000;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

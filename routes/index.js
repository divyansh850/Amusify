var express = require('express');
var router = express.Router();
var userModel=require('../models/userModel.js');
var songModel=require('../models/songModel.js');
var playlistModel=require('../models/playlistModel.js');
var passport=require('passport');
var multer=require('multer');
var id3=require('node-id3');
var crypto=require('crypto'); 
const {Readable}=require('stream');
var localStrategy=require('passport-local');
passport.use(new localStrategy(userModel.authenticate()));
const mongoose=require('mongoose');
const { promises } = require('readline');

mongoose.connect('mongodb://0.0.0.0/Spotify-N15').then(()=>{
  console.log('connected to db');
}).catch(err=>{
  console.log(err);
})

const conn=mongoose.connection

var gfsBucket,gfsBucketPoster
conn.once('open',()=>{
  gfsBucket=new mongoose.mongo.GridFSBucket(conn.db,{
    bucketName:"audio"
  })
  gfsBucketPoster=new mongoose.mongo.GridFSBucket(conn.db,{
    bucketName:"poster"
  })
})

/* GET home page. */
router.get('/', isLoggedIn ,async function(req, res, next) {
 
  const currentUser=await userModel.findOne({
    _id:req.user._id
  }).populate('playlist')           
     .populate({ 
      path: 'playlist',
      populate: {
      path: 'songs',
      model: 'song'
    }
  })                         

  //  console.log(JSON.stringify(currentUser))
  
  res.render('index', { currentUser });
});


// code for Registering User
router.post('/register',async function(req,res,next){

  var newUser = new userModel({
    //user data here
      email:req.body.email,
      username: req.body.username
    })
  userModel.register(newUser,req.body.password)
  .then(function(result){
    passport.authenticate('local')(req,res,async function(){
      
    const songs=await songModel.find() 
    const defaultPlaylist=await playlistModel.create({
      name:req.body.username,
      owner:req.user._id,
      songs:songs.map(song=>song._id)
    })

    // console.log(songs.map(song=>song._id)) //it return all songs id present in songs

    const newUser=await userModel.findOne({
        _id:req.user._id
       })

      newUser.playlist.push(defaultPlaylist._id)
      
      await newUser.save();

      //destination after user register
      res.redirect('/')
     })
    })
    .catch(function(err){
      res.send(err);
    })
});

router.get('/login',(req,res,next)=>{
  res.render('login');
})

router.get('/register',(req,res,next)=>{
  res.render('register');
})

// code for LogIn*
router.post('/login',passport.authenticate('local',
{    successRedirect : '/',
     failureRedirect : '/login'
}),function(req,res,next){ });

// code for Logout
router.get('/logout', function(req, res, next) {
  if(req.isAuthenticated()){
    req.logout(function(err) {
      if (err) { res.send(err); }
      else { res.redirect('/login') };
    });
  }
  else{
    res.redirect('/');
  }
});

// IsLoggedIn Middleware
function isLoggedIn(req,res,next){
  if(req.isAuthenticated()){
    return next();
  }
  else{
    res.redirect('/login');
  }
}

function isAdmin(req,res,next){
  if(req.user.isAdmin){
    return next();
  }
  else{
    return res.redirect('/');
  }
}

router.get('/poster/:posterName',(req,res,next)=>{
  gfsBucketPoster.openDownloadStreamByName(req.params.posterName).pipe(res);
})

const storage = multer.memoryStorage()
const upload = multer({ storage: storage })

// upload.single('song') //single music upload kar sakte hai
router.post('/uploadMusic',isLoggedIn,isAdmin,upload.array('song'),async (req,res,next)=>{
  
  // console.log(req.files);

  await Promise.all(req.files.map(async file=>{
    
    const randomName = crypto.randomBytes(20).toString('hex')

    // console.log(req.file);
    // console.log(id3.read(file.buffer));
  
    const songData=id3.read(file.buffer);
    //id3 is used to read metadata(title,artist) fromm the buffer
    Readable.from(file.buffer).pipe(gfsBucket.openUploadStream(randomName))
    Readable.from(songData.image.imageBuffer).pipe(gfsBucketPoster.openUploadStream(randomName+'poster'))
    
    await songModel.create({
      title:songData.title,
      artist:songData.artist,
      album:songData.album,
      size:file.size,     //file size
      poster:randomName+'poster',
      fileName:randomName
    })

  }))

  res.send('song uploaded');

})

router.get('/uploadMusic',isLoggedIn,isAdmin,(req,res,next)=>{
  res.render('uploadMusic');
})

router.get('/stream/:musicName',async (req,res,next)=>{

  const currentSong=await songModel.findOne({
    fileName:req.params.musicName
  })

  console.log(currentSong)

  const stream = gfsBucket.openDownloadStreamByName(req.params.musicName)
  
  res.set('Content-Type','audio/mpeg')
  res.set('Content-Length', currentSong.size + 1);
  res.set('Content-Range',`bytes ${0}-${currentSong.size - 1}/${currentSong.size}`)
  res.set('Content-Ranges','bytes')
  res.status(206)

  stream.pipe(res);
})

router.get('/search',(req,res,next)=>{
  res.render('search');
})

router.post('/search',async (req,res,next)=>{ 
  // console.log(req.body)
  const searchMusic=await songModel.find({
    title:{$regex:req.body.search}
  })
  // console.log(searchMusic)
  res.json({
    songs:searchMusic
  })
})


router.get('/likeMusic/:songid', isLoggedIn, isLoggedIn, async function (req, res, next) {
  const foundUser = await userModel.findOne({ username: req.session.passport.user })
  if (foundUser.likes.indexOf(req.params.songid) === -1) {
    foundUser.likes.push(req.params.songid);
  }
  else {
    foundUser.likes.splice(foundUser.likes.indexOf(req.params.songid), 1)
  }
  await foundUser.save();

  const foundSong = await songModel.findOne({ _id: req.params.songid })
  // console.log(foundSong)
  if (foundSong.likes.indexOf(foundUser._id) === -1) {
    foundSong.likes.push(foundUser._id);
  }
  else {
    foundSong.likes.splice(foundSong.likes.indexOf(foundUser._id), 1)
  }
  await foundSong.save();
  res.redirect('back');
  // console.log(foundUser)
})

router.get('/likedMusic', isLoggedIn, async function (req, res, next) {
  const songData = await userModel.findOne({ username: req.session.passport.user })
    .populate("liked")
  // console.log(songData);
  res.render("likedMusic", { songData });
})

// router.post("/createplaylist", isLoggedIn, async function (req, res, next) {
//   const defaultplayList = await playlistModel.create({
//     name: req.body.playlistName,
//     owner: req.user._id,
//   })

//   const newUser = await userModel.findOne({
//     _id: req.user._id
//   })

//   newUser.playlist.push(defaultplayList._id)
//   await newUser.save();
//   res.redirect('/');
// })

// router.get('/deleteplaylist/:playlistid', isLoggedIn, async function (req, res, next) {
//   const foundUser = await userModel.findOne({ username: req.session.passport.user })
//   console.log(foundUser)
//   foundUser.playlist.splice(foundUser.playlist.indexOf(req.params.playlistid), 1);

//   await foundUser.save()

//   const playlist = await playlistModel.findOneAndDelete({ _id: req.params.playlistid })
//   console.log(foundUser);
//   res.redirect("/");
// })

// router.get('/AddPlayList/:playlistid/:songid', isLoggedIn, async function (req, res, next) {
//   const foundPlayList = await playlistModel.findOne({ _id: req.params.playlistid })
//   foundPlayList.songs.push(req.params.songid);
//   await foundPlayList.save();
//   res.redirect("/");
// })

// router.get('/PlayList/:playlistid', isLoggedIn, async function (req, res, next) {
//   const userdata = req.user;
//   const foundPlayList = await playlistModel.findOne({ _id: req.params.playlistid })
//     .populate("songs");
//   res.render("playList", { foundPlayList, userdata })
// })

// router.get('/removesong/:playlistid/:songid', isLoggedIn, async function (req, res, next) {
//   const playlistData = await playlistModel.findOne({ _id: req.params.playlistid })
//   console.log(playlistData);
//   playlistData.songs.splice(playlistData.songs.indexOf(req.params.songid), 1);

//   await playlistData.save();

//   res.redirect("back");
// })

module.exports = router;

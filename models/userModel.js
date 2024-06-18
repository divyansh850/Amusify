const mongoose=require('mongoose');
const plm=require('passport-local-mongoose');

const userSchema=mongoose.Schema({
    username:String,
    email:String,
    contact:String,
    playlist:[{
        type:mongoose.Schema.Types.ObjectId,
        ref:'playlist'
    }],
    liked:[{
        type:mongoose.Schema.Types.ObjectId,
        ref:'song'
    }],
    profileImage:{
        type:String,
        default:'/public/images/defaultImg.png'
    },
    isAdmin:{
        type:Boolean,
        default:false
    }

})

userSchema.plugin(plm);
// userSchema.plugin(plm,{usernameField:'email'}); //email as username in password nodejs

module.exports=mongoose.model('user',userSchema);
const Joi = require("joi");
const logger = require("../logger");


const querySchema = Joi.object({

    page: Joi.number()
        .integer()
        .min(1)
        .default(1),

    limit: Joi.number()
        .integer()
        .min(1)
        .max(100)
        .default(10),

    status: Joi.string()
        .valid(
            "PENDING",
            "PROCESSING",
            "SENT",
            "FAILED"
        ),

    channel: Joi.string()
        .valid(
            "EMAIL",
            "SMS",
            "PUSH"
        ),

    eventType: Joi.string(),

    sortBy: Joi.string()
        .valid(
            "created_at",
            "status",
            "channel",
            "event_type"
        )
        .default("created_at"),

    order: Joi.string()
        .valid(
            "asc",
            "desc"
        )
        .default("desc")

});


module.exports = (req,res,next)=>{

    const {error,value}=querySchema.validate(
        req.query,
        {
            abortEarly:false
        }
    );


    if(error){

        const errors = error.details.map(
            detail=>detail.message
        );


        logger.warn(
            "Notification query validation failed",
            {
                errors,
                query:req.query
            }
        );


        return res.status(400).json({
            error:"Validation failed",
            details:errors
        });

    }


    req.query=value;

    next();

};
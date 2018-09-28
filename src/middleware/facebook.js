import _ from 'lodash';
import passport from 'passport';
import FacebookStrategy from 'passport-facebook-token';
import { createObject, successLoginInMiddleware } from 'inflex-authentication/helpers';

import { getConfig } from '../config';
import { repository, getId } from './../database';
import user from './../services/user';

const socialType = 1;

const defaultSettings = {
    'invalidToken' : function(res, message) {
        return res.status(422).json({ 
            'error' : true,
            "code" : '4220402',
            "type" : '',
            "title" : 'Invalid access token',
            "detail" : message || 'Invalid access token'
        });
    },

    'invalidRequest' : function(req, res) {
        return res.status(422).json({ 
            'error' : true,
            "code" : '4220401',
            "type" : '',
            "title" : 'Missing access token',
            "detail" : 'Missing "access_token" parameter'
        });
    }
};
var settings = defaultSettings;

var validateEmail = function (req, res, next) {
    if (req.body.access_token && typeof req.body.access_token == 'string')
        next();
    else
        settings.invalidRequest(req, res);
}

var getProfileFromFacebook = function (req, res, next) {
    passport.authenticate('facebook-token', function(err, user, info) {
        if (err) {
            return settings.invalidToken(res, err.message);
        } else if (!user) {
            return settings.invalidToken(res, 'Missing user from passport');
        }

        req.social = {
            'type' : 'facebook',
            'profile' : user.profile
        };

        successLoginInMiddleware(user.user, req, next, {
            'session' : false
        });
    })(req, res, next);
}

export default function (options, middleware) {
    settings = _.merge(defaultSettings, options || {});

    let facebookConfig = getConfig('facebook');

    passport.use(new FacebookStrategy({
        clientID: facebookConfig.client_id,
        clientSecret: facebookConfig.client_secret,
    }, (accessToken, refreshToken, profile, done) => {
        let facebookId = profile.id,
        
            userService = new user();

        repository('social')
            .findByIdAndType(facebookId, socialType)
            .then(social => {
                let hasSocial = function(identityId, socialId) {
                    createObject({
                        'identity' : identityId,
                        'social' : socialId
                    })
                    .then(user => {
                        done(null, {
                            'profile' : profile,
                            'refresh' : refreshToken,

                            'user' : user
                        });
                    })
                    .catch((err) => {
                        throw err;
                    });
                }

                if (!social) {
                    console.log("New social user");

                    userService
                        .createWithSocial(facebookId, socialType)
                        .then(data => {
                            hasSocial(getId(data.identity), getId(data.social));
                        });
                } else {
                    hasSocial(social.identity_id, getId(social));
                }
            });
    }));

    var ret = middleware || [];

    ret.push(
        validateEmail,

        getProfileFromFacebook
    );

    return ret;
}
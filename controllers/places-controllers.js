const fs= require('fs');

const { validationResult } = require('express-validator');
const mongoose = require('mongoose');

const HttpError = require('../models/http-error');
const getCoordsForAddress = require('../util/location');
const Place = require('../models/place');
const User = require('../models/user');


const getPlaceById = async (req, res, next) => {
  const placeId = req.params.pid; 

  let place;
  try {
    place = await Place.findById(placeId);
  } catch (err) {
    const error = new HttpError(
      'Something went wrong, could not find a place.',
      500
    );
    return next(error);
  }

  if (!place) {
    const error = new HttpError(
      'Could not find a place for the provided id.',
      404
    );
    return next(error);
  }

  res.json({ place: place.toObject({ getters: true }) }); 
};


const getPlacesByUserId = async (req, res, next) => {
  const userId = req.params.uid;

  //let places;
  let userWithPlaces
  try {
    userWithPlaces = await User.findById(userId).populate('places');
  } catch (err) {
    const error = new HttpError(
      'Fetching places failed, please try again later',
      500
    );
    return next(error);
  }

  if (!userWithPlaces || userWithPlaces.length === 0) {
    return next(
      new HttpError('Could not find places for the provided user id.', 404)
    );
  }

  res.json({ places: userWithPlaces.places.map(place => place.toObject({ getters: true })) });
};

const createPlace = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(
      new HttpError('Invalid inputs passed, please check your data.', 422)
    );
  }

  const { title, description, address } = req.body;

  let coordinates;
  try {
    coordinates = await getCoordsForAddress(address);
  } catch (error) {
    return next(error);
  }

  // const title = req.body.title;
  const relativePath = req.file.path.replace(/\\/g, '/').split('uploads')[1];
  const createdPlace = new Place({
    title,
    description,
    address,
    location: coordinates,
    image:
      `uploads${relativePath}`,
    creator : req.userData.userId
  });

  let user;

  try{
    user = await User.findById(req.userData.userId);

  } catch(err) {
    const error = new HttpError(
      'Creating place failed, please try again',
      500
    );
    return next(error);
  }

  if(!user) {
    const error = new HttpError(
      'Could not find user for provided id',
      404
    );
    return next(error);
  }

  console.log(user);

  try {
    const sess = await mongoose.startSession();
    sess.startTransaction();
    await createdPlace.save({ session: sess });
    user.places.push(createdPlace);
    await user.save({ session: sess});
    await sess.commitTransaction();
  } catch (err) {
    const error = new HttpError(
      'Creating place failed, please try again.',
      500
    );
    return next(error);
  }

  res.status(201).json({ place: createdPlace });
};

const updatePlace = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new HttpError('Invalid inputs passed, please check your data.', 422);
  }

  const { title, description } = req.body;
  const placeId = req.params.pid;

  let place;
  try {
    place = await Place.findById(placeId);
  } catch (err) {
    const error = new HttpError(
      'Something went wrong, could not update place.',
      500
    );
    return next(error);
  }

  if(place.creator.toString() !== req.userData.userId) {
    const error = new HttpError(
      'You are not allowed to edit this place.',
      401
    );
    return next(error);
  }

  place.title = title;
  place.description = description;

  try {
    await place.save();
  } catch (err) {
    const error = new HttpError(
      'Something went wrong, could not update place.',
      500
    );
    return next(error);
  }

  res.status(200).json({ place: place.toObject({ getters: true }) });
};

const deletePlace = async (req, res, next) => {
  const placeId = req.params.pid;

  let place;
  try {
    // Find the place and populate the creator
    place = await Place.findById(placeId).populate('creator');

    if (!place) {
      const error = new HttpError(
        'Could not find a place with the provided ID.',
        404
      );
      return next(error);
    }

    if(place.creator.id !== req.userData.userId) {
      const error = new HttpError(
        'You are not allowed to delete this place.',
        401
      );
      return next(error);
    }

    const imagePath = place.image;
    // Remove the place from the database
    await Place.findByIdAndDelete(placeId);

    // Remove the place reference from the creator's places array
    if (place.creator) {
      place.creator.places.pull(placeId); // Remove the place ID from the creator's places array
      await place.creator.save(); // Save the updated creator document
    }

    res.status(200).json({
      message: 'Deleted place.',
      place: {
        location: place.location,
        _id: place._id,
        title: place.title,
        description: place.description,
        image: place.image,
        address: place.address,
        creator: place.creator,
        __v: place.__v,
        id: place._id.toString(),
      }
    });
  } catch (err) {
    console.error("Error deleting place:", err); // Log the error for debugging
    const error = new HttpError(
      'Something went wrong, could not delete place.',
      500
    );
    return next(error);
  }
  fs.unlink(imagePath, err => {
    console.log(err);
  });
};


exports.getPlaceById = getPlaceById;
exports.getPlacesByUserId = getPlacesByUserId;
exports.createPlace = createPlace;
exports.updatePlace = updatePlace;
exports.deletePlace = deletePlace;
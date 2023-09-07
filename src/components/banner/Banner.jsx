import React from 'react';
import prathameshSVG from "../../assests/prathamesh-banner.png";
import ramen from '../../assests/random/ramen.svg';
import "./banner.css";

export default function Banner() {
  return (
    <div className="banner">
        <div className="banner-content">
        <div className="name-container">
            <div className="name">
            <h1>Hi, I'm</h1>
            <h1 className="my-name">
                Prathamesh <div className="underline"></div>
            </h1>
            </div>

            <div>
            <h2 className="front-end">
                Front-End <b>Engineer</b>
            </h2>
            </div>
            <div className="name-exp">
            <span>4+ years</span>
            of Experience
            </div>
        </div>
        <div className="image-container">
            <img
            src={prathameshSVG}
            alt="prathamesh-banner"
            className="prathamesh-banner"
            />
        </div>
        </div>
        <div className='ramen-animation'>
            <img src={ramen} alt='ramen' className='ramen' />
        </div>
    </div>
  )
}

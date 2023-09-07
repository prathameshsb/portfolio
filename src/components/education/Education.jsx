import React from 'react';

import Neulogo from "../../assests/logos/Northeastern_Huskies_logo.svg.png";
import Mulogo from "../../assests/logos/MU-logo.png";
import gamingPad from '../../assests/random/gaming-pad.svg'

import '../experience/experience.css';

function Education() {
  return (
    <section className="education">
        <h1 className="word">Education</h1>
        <div className="education-content">
        <div className="education-container Neulogo">
            <div className="education-icon">
            <img src={Neulogo} alt="Neulogo-logo" className="logo" />
            </div>
            <div className="education-details">
            <p>
                <b>Northeastern University</b>
            </p>
            <p>Masters in Digital Media, Interactive Media</p>
            <p>Graduation Date - Dec, 2020</p>
            </div>
        </div>
        <div className="education-container Mumbailogo">
            <div className="education-icon">
            <img src={Mulogo} alt="MU-logo" className="logo" />
            </div>
            <div className="education-details">
            <p>
                <b>University of Mumbai</b>
            </p>
            <p>Bachelors in Information Techonlogy</p>
            <p>Graduation Date - June, 2018</p>
            </div>
        </div>
        </div>
        <div className='gaming-pad'>
            <img src={gamingPad} alt='gamingPad' className='gamingPad'/>
        </div>
    </section>
  )
}

export default Education
import React from 'react';

import Adobelogo from "../../assests/logos/adobe-logo.png";
import Gryphonlogo from "../../assests/logos/gryphon-logo.png";
import Collegpondlogo from "../../assests/logos/collegepond-logo.jpeg";
import Incluvielogo from "../../assests/logos/incluvie-logo.png";
import Neulogo from "../../assests/logos/Northeastern_Huskies_logo.svg.png";

import './experience.css';

function Experience() {
  return (
    <section id="experience" className="experience">
        <h1 className="word">Work Experience</h1>
        <div className="experience-content">
        <div className="experience-container adobe-logo">
            <div className="company-icon">
            <img src={Adobelogo} alt="adobe-logo" className="logo" />
            </div>
            <div className="company-details">
            <p>
                <b>Adobe</b>
            </p>
            <p>Web Development Engineer</p>
            <p>March 2021 - June 2023</p>
            </div>
        </div>
        <div className="experience-container gryphon-logo">
            <div className="company-icon">
            <img src={Gryphonlogo} alt="gryphon-logo" className="logo" />
            </div>
            <div className="company-details">
            <p>
                <b>Gryphon Networks</b>
            </p>
            <p>Software Developer</p>
            <p>January 2020 - July 2020</p>
            </div>
        </div>
        <div className="experience-container Neulogo">
            <div className="company-icon">
            <img src={Neulogo} alt="Neulogo-logo" className="logo" />
            </div>
            <div className="company-details">
            <p>
                <b>Northeastern University</b>
            </p>
            <p>Graduate Teaching Assistant</p>
            <p>September 2019 - Dec 2020</p>
            </div>
        </div>
        <div className="experience-container incluvie-logo">
            <div className="company-icon">
            <img src={Incluvielogo} alt="incluvie-logo" className="logo" />
            </div>
            <div className="company-details">
            <p>
                <b>Incluvie</b>
            </p>
            <p>UI/UX Designer and Engineer</p>
            <p>January 2019 - May 2019</p>
            </div>
        </div>
        <div className="experience-container collegepond-logo">
            <div className="company-icon">
            <img
                src={Collegpondlogo}
                alt="collegepond-logo"
                className="logo"
            />
            </div>
            <div className="company-details">
            <p>
                <b>Converge by Collegpond</b>
            </p>
            <p>Front-End Engineer</p>
            <p>September 2017 - August 2018</p>
            </div>
        </div>
        </div>
    </section>
  )
}

export default Experience
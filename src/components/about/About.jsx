import React from 'react';
import './about.css';
import rickshaw from '../../assests/rickshaw.svg';

function About() {
  return (
    <section id="about" className="about">
        <h1 className="word">About Me</h1>
        <div className="about-content">
        <div className="about-container">
            <div className="about-image-holder">
            <img
                src={require("../../assests/indiaGate.svg").default}
                alt="mySvgImage"
            />
            <div className='rickshaw-animation'>
                <img className='rickshaw' src={rickshaw} alt='richshaw'/>
            </div>
            </div>
        </div>
        <div className="about-text-content">
            <p>
            As an individual contributor, I excel in translating these
            requests into actionable solutions. My approach involves
            extensive collaboration with cross-functional teams within the
            organization. This includes in-depth discussions on feature
            scalability, technology selection, cost analysis, and presenting
            viable alternatives to optimize processes.
            </p>
            <p>
            I closely engage with product owners, event teams, backend
            specialists, and head designers. Furthermore, my expertise
            extends to liaising with external partners, further enhancing
            the effectiveness of my contributions. I currently live in
            Milpitas, California.
            </p>
            <p>
            GO HUSKIES |{" "}
            <span className="red">
                <b>RED</b>
            </span>
            <b>BLACK</b> ONE PACK
            </p>
        </div>
        </div>
    </section>
  )
}

export default About
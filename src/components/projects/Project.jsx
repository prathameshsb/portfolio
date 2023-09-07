import React from 'react';

import shopping1 from "../../assests/projects/shopping-cart.png";
import face from "../../assests/projects/face.png";
import incluvie from "../../assests/projects/incluvie.png";
import exmouth from "../../assests/projects/exmouth.png";
import { BsGithub } from 'react-icons/bs'

import gaming2 from '../../assests/random/gaming-2.svg';

import './project.css'

function Project() {
  return (
    <section id="projects" className="projects">
        <h1 className="word">Projects</h1>
        <div className='gaming-animation'>
            <img src={gaming2} alt='gaming2' className='gaming2'/>
            <img src={gaming2} alt='gaming2' className='gaming2 one'/>
            <img src={gaming2} alt='gaming2' className='gaming2 two'/>
        </div>
        <div className="new-project-container">
        <div className="project-card-holder">
            <div className="new-project-card">
                <img
                    className="project-image"
                    src={shopping1}
                    alt="shopping-cart-project"
                />
            </div>
            <div className='text-btn-holder'>
                <h2>Shopping Cart</h2>
                <button className='github-btn' 
                    type="button"
                    onClick={(e) => {
                        e.preventDefault();
                        window.location.href='https://github.com/prathameshsb/shopping-cart-v2';
                    }}><BsGithub size={25} /> <b>Github</b> </button>
            </div>
            <p>React, Hooks, Firebase, Stripe</p>
        </div>
        <div className="project-card-holder">
            <div className="new-project-card">
            <img
                className="project-image"
                src={face}
                alt="face-detection-project"
            />
            </div>
            <div className='text-btn-holder'>
                <h2>Face Detection</h2>
                <button className='github-btn' 
                    type="button"
                    onClick={(e) => {
                        e.preventDefault();
                        window.location.href='https://github.com/prathameshsb/shopping-cart-v2';
                    }}><BsGithub size={25} /> <b>Github</b> </button>
            </div>
            <p>React, Hooks, Firebase, Stripe</p>
        </div>{" "}
        <div className="project-card-holder">
            <div className="new-project-card">
            <img
                className="project-image"
                src={incluvie}
                alt="incluvie-project"
            />
            </div>
            <div className='text-btn-holder'>
                <h2>Incluvie</h2>
                <button className='github-btn' 
                    type="button"
                    onClick={(e) => {
                        e.preventDefault();
                        window.location.href='https://github.com/prathameshsb/incluvie-redesign';
                    }}><BsGithub size={25} /> <b>Github</b> </button>
            </div>
            <p>Adobe XD, Illustrator, Wireframing</p>
        </div>{" "}
        <div className="project-card-holder">
            <div className="new-project-card">
            <img
                className="project-image"
                src={exmouth}
                alt="exmouth-project"
            />
            </div>
            <div className='text-btn-holder'>
                <h2>Exmouth</h2>
                <button className='github-btn' 
                    type="button"
                    onClick={(e) => {
                        e.preventDefault();
                        window.location.href='https://github.com/prathameshsb/exmouth-view-redesign';
                    }}><BsGithub size={25} /> <b>Github</b> </button>
            </div>
            <p>Adobe XD, Illustrator, Wireframing</p>
        </div>{" "}
        </div>
    </section>
  )
}

export default Project
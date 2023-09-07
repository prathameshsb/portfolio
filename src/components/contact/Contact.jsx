import React from 'react';

import linkedin from "../../assests/social/likendin_icon.png";
import fbIcon from "../../assests/social/facebook_icon.png";
import githubIcon from "../../assests/social/github_icon.png";
import instagram from "../../assests/social/instagram_icon.png";

import './contact.css';

function Contact() {
  return (
     <section id="contact" className="contact">
        <h1 className="word">Contact</h1>
        <div className="contact-email">
        <div>
            <p>
            <b>Email</b>
            <p className="emails">
                <a
                className="email-color"
                href="mailto:borgharkar.p@northeastern.edu"
                >
                borgharkar.p@northeastern.edu
                </a>
                <a
                className="email-color"
                href="mailto:prathameshsb.pb@gmail.com"
                >
                prathameshsb.pb@gmail.com
                </a>
            </p>
            </p>
        </div>
        <div>
            <p>
            <b>Phone Number</b>
            </p>
            <p>+1(857)-891-2152</p>
        </div>
        </div>
        <div className="social-container">
        <div className="social">
            <a target="_blank" rel="noreferrer" href='https://www.linkedin.com/in/bprathamesh'>
                <img className="social-icon" src={linkedin} alt="linkedin-logo" />
            </a>
        </div>
        <div className="social">
            <a target="_blank" rel="noreferrer" href='https://github.com/prathameshsb'>
                <img className="social-icon" src={githubIcon} alt="github-logo" />
            </a>
        </div>
        <div className="social">
            <a target="_blank" rel="noreferrer" href='https://www.facebook.com/prathamesh.borgharkar/'>
                <img className="social-icon" src={fbIcon} alt="facebook-logo" />
            </a>
        </div>
        <div className="social">
            <a target="_blank" rel="noreferrer" href='https://www.instagram.com/prathameshsb/'>
                <img className="social-icon" src={instagram} alt="instagram-logo"/>
            </a>
        </div>
        </div>
    </section>
  )
}

export default Contact
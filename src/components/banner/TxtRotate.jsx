import React, { useEffect } from 'react';

const TxtRotate = ({ toRotate, period }) => {
  let loopNum = 0;
  let txt = '';
  let isDeleting = false;

  const tick = () => {
    const i = loopNum % toRotate.length;
    const fullTxt = toRotate[i];

    if (isDeleting) {
      txt = fullTxt.substring(0, txt.length - 1);
    } else {
      txt = fullTxt.substring(0, txt.length + 1);
    }

    const el = document.querySelector('.txt-rotate');
    if (el) {
      el.innerHTML = '<span class="wrap">' + txt + '</span>';
    }

    let delta = 400 - Math.random() * 100; // slow down the animation by changing 400

    if (isDeleting) {
      delta /= 2;
    }

    if (!isDeleting && txt === fullTxt) {
      delta = 3000;
      isDeleting = true;
    } else if (isDeleting && txt === '') {
      isDeleting = false;
      loopNum++;
      delta = 100; // adjust the speed after pause.
    }

    setTimeout(() => {
      tick();
    }, delta);
  };

  useEffect(() => {
    tick();
  }, []);

  return (
    <span className="txt-rotate">
      <span className="wrap"></span>
    </span>
  );
};

export default TxtRotate;

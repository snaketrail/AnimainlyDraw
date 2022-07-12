window.addEventListener('load', loadDrawing);

const menuBtnsDiv = document.getElementsByTagName('div')[0];
function clear(){
    while (menuBtnsDiv.firstChild) {
        menuBtnsDiv.removeChild(menuBtnsDiv.firstChild);
    };
}

    function loadDrawing(){
        clear();

        let canva = document.createElement('div');
        let canvaStyle = {
            background: 'white',
            'background-image': 'none',
            position: 'absolute',
            'margin-left': '-6px',
            border: 'solid black 3px',
            height: '700px',
            width: '1200px',
            top: '-130px',
            left: '-380px',

        };
        Object.assign(canva.style, canvaStyle );
        menuBtnsDiv.appendChild(canva);

        let divForButtons = document.createElement('div');
        divForButtons.className = 'divForBtns';
        menuBtnsDiv.appendChild(divForButtons);

        let btn1 = document.createElement('button');
        btn1.innerText = 'Character';
        let btn2 = document.createElement('button');
        btn2.innerText = 'Backgrounds';
        btn1.className = 'btnInDrawDiv';
        btn2.className = 'btnInDrawDiv';
        let dropDiv = document.createElement('div');
        dropDiv.className = 'dropDd';
        let dropDcontent = document.createElement('div');
        let btninDrop1 = document.createElement('button');
        let btninDrop2 = document.createElement('button');
        btninDrop1.innerText = 'Girl';
        btninDrop2.innerText = 'Boy';
        dropDcontent.appendChild(btninDrop1);
        dropDcontent.appendChild(btninDrop2);
        dropDiv.appendChild(btn1);
        dropDiv.appendChild(dropDcontent);
        btninDrop1.className = 'links';
        btninDrop2.className = 'links';


        dropDiv.className = 'dropDd';
        let dropDiv1 = document.createElement('div');
        let dropDcontent1 = document.createElement('div');
        let btninDrop3 = document.createElement('button');
        dropDcontent1.appendChild(btninDrop3);
        dropDiv1.appendChild(btn2);
        dropDiv1.appendChild(dropDcontent1);

        btninDrop3.className = 'links';
        btninDrop3.innerText = 'Apartment';
        dropDiv1.className = 'dropDd1';
        dropDcontent.className = 'noShow';
        dropDcontent.id = 'dropItDown';
        dropDcontent1.id = 'dropItDown1';
        dropDcontent1.className = 'noShow';



        divForButtons.appendChild(dropDiv);
        divForButtons.appendChild(dropDiv1);

        btn1.addEventListener('click', dropFunct);
        btn2.addEventListener('click', dropFunct2);

        function dropFunct() {
            document.getElementById("dropItDown").classList.toggle("show");
          }
          window.onclick = function(event) {
            if (!event.target.matches('.btnInDrawDivMenu')) {
              let dropdowns = document.getElementsByClassName("dropCont");
              for (let i = 0; i < dropdowns.length; i++) {
                let openDropdown = dropdowns[i];
                if (openDropdown.classList.contains('show')) {
                  openDropdown.classList.remove('show');
                }
              }
            }
          }
    }
        function dropFunct2() {
            document.getElementById("dropItDown1").classList.toggle("show");
        }
        window.onclick = function(event) {
            if (!event.target.matches('.btnInDrawDivMenu')) {
            let dropdowns = document.getElementsByClassName("dropCont1");
            for (let i = 0; i < dropdowns.length; i++) {
                let openDropdown = dropdowns[i];
                if (openDropdown.classList.contains('show')) {
                openDropdown.classList.remove('show');
                }
            }
            }
        }

//     <div class="dropdown">
//     <button onclick="myFunction()" class="menuBTn">Backgrounds</button>
//     <div id="myDropdown" class="dropdown-content">
//       <button class="links">Homes</button>
//       <button id="Forest" class="links">Forests</button>
//       <button class="links">City</button>
//       <button class="links">Fantasy</button>
//     </div>
// </div>

// function myFunction() {
//     document.getElementById("myDropdown").classList.toggle("show");
//   }
//   window.onclick = function(event) {
//     if (!event.target.matches('.menuBTn')) {
//       let dropdowns = document.getElementsByClassName("dropdown-content");
//       for (let i = 0; i < dropdowns.length; i++) {
//         let openDropdown = dropdowns[i];
//         if (openDropdown.classList.contains('show')) {
//           openDropdown.classList.remove('show');
//         }
//       }
//     }
//   }
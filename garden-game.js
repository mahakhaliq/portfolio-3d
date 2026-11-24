// A tiny command-sequence puzzle inspired by game scripting.
export function startRobotGarden(host) {
    let round = 0;
    const layouts = [
        {goal:2, rocks:[1,4,7]},
        {goal:3, rocks:[4,8,10]},
        {goal:15, rocks:[1,5,8,14]}
    ];
    const labels = [['↑',0,-1],['→',1,0],['↓',0,1],['←',-1,0]];
    let commands = [], position = 12;
    const board = document.createElement('div'), controls = document.createElement('div');
    const status = document.createElement('p');
    board.className='robot-board'; controls.className='game-controls'; status.setAttribute('aria-live','polite');
    host.replaceChildren(board,status,controls);
    function button(label,action,description) {
        const b=document.createElement('button'); b.type='button'; b.textContent=label;
        if(description)b.setAttribute('aria-label',description);
        b.onclick=action; controls.append(b);
    }
    function paint(){
        board.replaceChildren();
        for(let i=0;i<16;i++){
            const cell=document.createElement('span');
            cell.textContent=i===position?'🤖':i===layouts[round].goal?'🌸':layouts[round].rocks.includes(i)?'🪨':'·';
            board.append(cell);
        }
    }
    function reset(){
        position=12;commands=[];paint();controls.replaceChildren();
        status.textContent='Plot a route from the robot to the blossom.';
        labels.forEach(([arrow],i)=>button(arrow,()=>{
            if(commands.length<16)commands.push(i);
            status.textContent=commands.map(n=>labels[n][0]).join(' ');
        },['Add up','Add right','Add down','Add left'][i]));
        button('Clear',reset);
        button('Run',()=>{
            position=12;
            for(const n of commands){
                const x=position%4+labels[n][1],y=Math.floor(position/4)+labels[n][2];
                if(x<0||x>3||y<0||y>3||layouts[round].rocks.includes(y*4+x)){
                    paint();status.textContent='Path blocked. Clear the route and try again.';return;
                }
                position=y*4+x;
                if(position===layouts[round].goal){
                    paint();status.textContent=round===2?'All three gardens solved!':'Blossom reached!';
                    controls.replaceChildren();button(round===2?'Play again':'Next garden',()=>{round=(round+1)%3;reset()});return;
                }
            }
            paint();status.textContent='Add more directions to reach the blossom.';
        });
    }
    reset();
}



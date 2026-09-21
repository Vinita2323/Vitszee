const fs = require('fs');

const targetFile = 'frontend/src/modules/delivery/pages/OrderDetails.jsx';
let content = fs.readFileSync(targetFile, 'utf8');

// The new component to inject
const newComponent = `
const NavigationSlideButton = ({ isReturn, step, steps, onComplete }) => {
  const [dragX, setDragX] = React.useState(0);
  const [isSlideComplete, setIsSlideComplete] = React.useState(false);

  React.useEffect(() => {
    setIsSlideComplete(false);
    setDragX(0);
  }, [step]);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-md shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.1)]">
      <div className="max-w-2xl mx-auto p-4">
        <div className="relative h-16 bg-slate-100 rounded-full overflow-hidden select-none">
          <motion.div
            className={\`absolute inset-0 flex items-center justify-center text-slate-400 font-bold text-lg pointer-events-none transition-opacity duration-300 \${
              dragX > 50 ? "opacity-0" : "opacity-100"
            }\`}
            animate={{ x: [0, 5, 0] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          >
            Slide to {isReturn
              ? step === 1 ? "ARRIVED AT CUSTOMER" : step === 3 ? "ARRIVED AT SELLER" : steps[step - 1]?.action
              : steps[step - 1]?.action} <ChevronRight className="ml-1" />
          </motion.div>

          <motion.div
            className={\`absolute inset-y-0 left-0 \${steps[step - 1]?.bg || "bg-brand-50"} opacity-50\`}
            style={{ width: dragX + 60 }}
          />

          <motion.div
            className={\`absolute top-1 bottom-1 left-1 w-14 rounded-full flex items-center justify-center shadow-md cursor-grab active:cursor-grabbing z-20 \${
              steps[step - 1]?.color || "bg-primary"
            }\`}
            drag="x"
            dragConstraints={{ left: 0, right: 280 }}
            dragElastic={0.05}
            dragMomentum={false}
            onDrag={(event, info) => {
              setDragX(Math.max(0, info.offset.x));
            }}
            onDragEnd={(event, info) => {
              if (info.offset.x > 150) {
                setIsSlideComplete(true);
                onComplete();
              } else {
                setDragX(0);
              }
            }}
            animate={{ x: isSlideComplete ? 280 : 0 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <ChevronRight className="text-white" size={24} />
          </motion.div>
        </div>
      </div>
    </div>
  );
};
`;

content = content.replace('const OrderDetails = () => {', newComponent + '\nconst OrderDetails = () => {');

// Remove the old inline component in OrderDetails
const oldSliderRegex = /\{\(\(isReturn && \(step === 1 \|\| step === 3\) && isAssignedRider\) \|\| \(!isReturn && step <= 2\)\) && \([\s\S]*?<div className="fixed bottom-0[\s\S]*?<\/ChevronRight>\s*<\/motion\.div>\s*<\/div>\s*<\/div>\s*<\/div>\s*\)\}/m;

const replacementSlider = `{((isReturn && (step === 1 || step === 3) && isAssignedRider) || (!isReturn && step <= 2)) && (
        <NavigationSlideButton
          isReturn={isReturn}
          step={step}
          steps={steps}
          onComplete={() => {
            setIsSlideComplete(true);
            handleNextStep();
          }}
        />
      )}`;

content = content.replace(oldSliderRegex, replacementSlider);

// We should also remove the `const [isSlideComplete, setIsSlideComplete] = useState(false);` and `const [dragX, setDragX] = useState(0);`
// Actually, `isSlideComplete` and `dragX` are also set manually when advancing UI steps (like `setDragX(0)`, `setIsSlideComplete(false)`).
// Let's just remove the `setDragX(0)` and `setIsSlideComplete(false)` everywhere they are called, as the new NavigationSlideButton will reset itself based on `step`.
content = content.replace(/setIsSlideComplete\(false\);\s*setDragX\(0\);/g, '');

fs.writeFileSync(targetFile, content);
console.log('OrderDetails patched successfully!');
